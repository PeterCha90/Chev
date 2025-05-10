import Form from 'next/form';

import { Input } from './ui/input';
import { Label } from './ui/label';

export function AuthForm({
  action,
  children,
  defaultName = '',
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultName?: string;
}) {
  return (
    <Form action={action} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="name"
          className="text-zinc-600 font-normal dark:text-zinc-400"
        >
          이름
        </Label>

        <Input
          id="name"
          name="name"
          className="bg-muted text-md md:text-sm"
          type="text"
          placeholder="사용자 이름"
          autoComplete="name"
          required
          autoFocus
          defaultValue={defaultName}
        />
      </div>

      {children}
    </Form>
  );
}
