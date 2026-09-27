import { useEffect, useRef } from 'react';

export function ErrorNotice({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // 保存ボタンから離れた位置に出るエラーも、修正前に読める位置へ移す。
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: 'center' });
  }, [message]);
  return (
    <p className="inline-error" role="alert" ref={ref} tabIndex={-1}>
      {message}
    </p>
  );
}
