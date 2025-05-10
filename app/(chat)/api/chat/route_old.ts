import {
  appendClientMessage,
  createDataStream,
  createDataStreamResponse,
  smoothStream,
  streamText,
  type UIMessage,
  type Message,
  generateText,
  type TextPart,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import type { ResumableStreamContext } from 'resumable-stream';
import { after } from 'next/server';
import { differenceInSeconds } from 'date-fns';

export const maxDuration = 60;

function getStreamContext(): ResumableStreamContext | null {
  // 실제 구현이 필요하다면 여기에 작성
  return null;
}

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

function toUIMessages(messages: any[]): UIMessage[] {
  return messages.map((msg) => {
    const parts = safeJsonParse<TextPart[]>(msg.parts, []);
    const attachments = safeJsonParse(msg.attachments, []);

    // parts에서 텍스트 내용 추출
    const textContent =
      Array.isArray(parts) && parts.length > 0 && 'text' in parts[0]
        ? (parts[0] as TextPart).text
        : '';

    return {
      id: msg.id,
      role: msg.role,
      content: textContent,
      parts: parts,
      experimental_attachments: attachments,
      createdAt: msg.createdAt,
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

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (!chat || chat.userId !== session.user.id) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    // 사용자 메시지 저장
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
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };
    return createDataStreamResponse({
      execute: async (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: messages.map(excludeContent),
          maxSteps: 10,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          toolChoice: 'auto',
          onFinish: async ({ response, usage }) => {
            console.log('response.messages:', response.messages);
            console.log('Full response:', response);
            console.log('Usage:', usage);

            // 응답이 없는 경우 처리
            let responseMessages = response.messages;
            if (!responseMessages || responseMessages.length === 0) {
              const lastUserMessage = messages.find(
                (msg) => msg.role === 'user',
              );
              if (lastUserMessage) {
                const { text: responseText } = await generateText({
                  model: myProvider.languageModel(selectedChatModel),
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
              console.error('No assistant message found!', responseMessages);
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
      onError: (error: any) => {
        console.error('Stream error:', error);
        return JSON.stringify(error) || 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

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

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new Response('No streams found', { status: 404 });
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new Response('No recent stream found', { status: 404 });
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
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
