import PageMeta from '../../components/common/PageMeta';
import AuthLayout from './AuthPageLayout';
import SignUpForm from '../../components/auth/SignUpForm';

export default function SignUp() {
  return (
    <>
      <PageMeta title="ระบบสต๊อกอะไหล่" description="ระบบสต๊อกอะไหล่ สำหรับงานซ่อมบำรุง" />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}
