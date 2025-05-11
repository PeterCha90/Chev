'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { toast } from '@/components/toast';

import { AuthForm } from '@/components/auth-form';
import { SubmitButton } from '@/components/submit-button';

import { login, type LoginActionState } from '../actions';
import { useSession } from 'next-auth/react';

export default function Page() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: 'idle',
    },
  );

  const { update: updateSession } = useSession();

  useEffect(() => {
    if (state.status === 'failed') {
      toast({
        type: 'error',
        description: '로그인에 실패했습니다!',
      });
    } else if (state.status === 'invalid_data') {
      toast({
        type: 'error',
        description: '입력값이 올바르지 않습니다!',
      });
    } else if (state.status === 'success') {
      const handleSuccess = async () => {
        try {
          setIsSuccessful(true);
          // await updateSession();
          router.push('/');
        } catch (error) {
          toast({
            type: 'error',
            description: '세션 업데이트에 실패했습니다!',
          });
        }
      };
      handleSuccess();
    }
  }, [state.status, router, updateSession]);

  const handleSubmit = async (formData: FormData) => {
    setName(formData.get('name') as string);
    try {
      await formAction(formData);
    } catch (error) {
      toast({
        type: 'error',
        description: '로그인 처리 중 오류가 발생했습니다!',
      });
    }
  };

  return (
    <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">로그인</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            닉네임을 입력하여 대화를 시작하세요.
          </p>
        </div>
        <AuthForm action={handleSubmit} defaultName={name}>
          <SubmitButton isSuccessful={isSuccessful}>대화하기</SubmitButton>
        </AuthForm>
      </div>
    </div>
  );
}
