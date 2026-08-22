// SignOut.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { URL } from '@/api';
import { logoutApi } from '@/api/auth/logout';
import { useAuthStore } from '@/store/auth';

const SignOut = () => {
  const navigate = useNavigate();

  useEffect(() => {

    (async () => {
      // Attempt server-side logout, but always clear client state
      try {
        await logoutApi();
      } catch (err) {
        console.warn('Sign-out API error:', err);
      } finally {
        useAuthStore.getState().logout();
        navigate(URL.LOGIN, { replace: true });
      }
    })();
  }, [navigate]);

  return null; // could render a spinner if you want
};

export default SignOut;
