import {
  streamText,
  type Message,
  type UIMessage,
  type TextPart,
  generateText,
  appendClientMessage,
  createDataStream,
  smoothStream,
  appendResponseMessages,
} from 'ai';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { geolocation } from '@vercel/functions';
import { createOllama } from 'ollama-ai-provider';
import { auth, type UserType } from '@/app/(auth)/auth';
import { generateTitleFromUserMessage } from '../../actions';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  getUser,
  createUser,
  saveMessages,
  createStreamId,
} from '@/lib/db/queries';
import { isProductionEnvironment } from '@/lib/constants';
import { after } from 'next/server';
import {
  type ResumableStreamContext,
  createResumableStreamContext,
} from 'resumable-stream';

export const maxDuration = 60;

function safeJsonParse<T>(input: any, fallback: T): T {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return fallback;
    }
  }
  if (input == null) return fallback;
  return input;
}

function toUIMessages(messages: Array<any>): Array<UIMessage> {
  return messages.map((message) => {
    const parts = safeJsonParse<Array<TextPart>>(message.parts, []);
    const textContent =
      parts.length > 0 && parts[0].type === 'text' ? parts[0].text : '';

    return {
      id: message.id,
      parts: parts,
      role: message.role as UIMessage['role'],
      content: textContent,
      createdAt: message.createdAt,
      experimental_attachments: safeJsonParse(message.attachments, []),
    };
  });
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new Response('Invalid request body', { status: 400 });
  }

  const { id, message, selectedChatModel, selectedVisibilityType } =
    requestBody;

  if (!message.content || message.content.length === 0) {
    return new Response('Messages are required', { status: 400 });
  }

  const ollama = createOllama({});
  const session = await auth();

  if (!session?.user?.name) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 사용자가 존재하는지 확인하고, 없다면 생성
    const existingUsers = await getUser(session.user.name);
    let user: { id: string; name: string };

    if (existingUsers.length === 0) {
      await createUser(session.user.name);
      const [newUser] = await getUser(session.user.name);
      user = newUser;
    } else {
      [user] = existingUsers;
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: user.id,
      differenceInHours: 24,
    });

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (!chat || chat.userId !== user.id) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    // 사용자 메시지 저장 ✍️ 대화 Context를 LLM이 기억하기 위해 저장
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: JSON.stringify(message.parts),
          attachments: JSON.stringify(message.experimental_attachments ?? []),
          createdAt: new Date(),
        },
      ],
    });

    const previousMessages = await getMessagesByChatId({ id });
    const uiMessages = toUIMessages(previousMessages);

    const messages = appendClientMessage({
      messages: uiMessages,
      message: {
        id: message.id,
        role: 'user',
        content: message.content,
        parts: message.parts,
        experimental_attachments: message.experimental_attachments,
      },
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createDataStream({
      execute: (dataStream) => {
        const result = streamText({
          model: ollama('qwen2.5:7b'),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          maxSteps: 10,
          experimental_activeTools: [],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {},
          onFinish: async ({ response }) => {
            if (session.user?.id) {
              try {
                console.log('Response messages:', response.messages);
                const assistantMessages = response.messages.filter(
                  (message) => message.role === 'assistant',
                );
                console.log('Assistant messages:', assistantMessages);

                let responseMessages = response.messages;
                if (!responseMessages || responseMessages.length === 0) {
                  const lastUserMessage = messages.find(
                    (msg) => msg.role === 'user',
                  );
                  if (lastUserMessage) {
                    const { text: responseText } = await generateText({
                      model: ollama('qwen2.5:7b'),
                      system: systemPrompt({ selectedChatModel, requestHints }),
                      prompt: lastUserMessage.content,
                    });

                    responseMessages = [
                      {
                        role: 'assistant',
                        content: responseText,
                        id: generateUUID(),
                      },
                    ];
                  }
                }
                // 어시스턴트 메시지 저장
                if (responseMessages && responseMessages.length > 0) {
                  const assistantMessage = responseMessages[0];
                  await saveMessages({
                    messages: [
                      {
                        id: assistantMessage.id,
                        chatId: id,
                        role: assistantMessage.role,
                        parts: JSON.stringify([
                          { type: 'text', text: assistantMessage.content },
                        ]),
                        attachments: JSON.stringify([]),
                        createdAt: new Date(),
                      },
                    ],
                  });
                } else {
                  console.error(
                    'No assistant message found!',
                    responseMessages,
                  );
                }
              } catch (error) {
                console.error('Failed to save chat:', error);
                console.error('Response:', response);
                console.error('Session user:', session.user);
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error) => {
        console.log('--------------------------------');
        console.error(error);
        console.log('--------------------------------');
        return 'Oops, an error occurred!';
      },
    });

    return new Response(stream);
  } catch (error) {
    console.error(error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new Response('id is required', { status: 400 });
  }

  const session = await auth();

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let chat: any;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new Response('Not found', { status: 404 });
  }

  if (!chat || chat.userId !== session.user.id) {
    return new Response('Forbidden', { status: 403 });
  }

  const messages = await getMessagesByChatId({ id: chatId });
  const mostRecentMessage = messages.at(-1);

  if (!mostRecentMessage) {
    return new Response('No messages found', { status: 404 });
  }

  return Response.json(mostRecentMessage, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (!chat || chat.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}

function excludeContent(message: Message): Message {
  return {
    ...message,
    content: '',
  };
}
