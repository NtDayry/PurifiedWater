import { useState } from 'react';

export default function useCodeCheck() {
  const [hasCode, setHasCode] = useState(false);
  const [waitCheckCode, setWaitCheckCode] = useState(false);
  const [disabledSubmit, setDisabledSubmit] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout>>();

  return {
    hasCode,
    setHasCode,
    waitCheckCode,
    setWaitCheckCode,
    disabledSubmit,
    setDisabledSubmit,
    typingTimeout,
    setTypingTimeout,
  };
}
