import FactoryLayout3D from '@/components/factory-layout/FactoryLayout3D';

// หน้าแผนผังโรงงาน: เน้นโมเดล 3 มิติเต็มพื้นที่ ตัวควบคุมรวมอยู่ในแถบด้านบนของโมเดล
export default function FactoryLayoutPage() {
  return (
    <div className="pb-2">
      <FactoryLayout3D />
    </div>
  );
}
