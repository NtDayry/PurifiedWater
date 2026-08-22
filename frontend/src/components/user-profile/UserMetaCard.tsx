import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Webcam from 'react-webcam';
import Badge from '../ui/badge/Badge';
import { SolarCameraIcon, MaterialUploadIcon, IxCaptureIcon, CloseIcon } from '@/icons';
import Button from '@/components/ui/button/Button';
import { User } from '@_types/user';
import { api, API_URL, parseFetchError } from '@/api';
import useSwalAlert from '@/hooks/useSwalAlert';
import { imagePath } from '@/components/utils/formatImagePath';

interface UserMetaCardProps {
  post?: User;
  reload?: () => void;
}

export default function UserMetaCard({ post, reload }: UserMetaCardProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const webcamRef = useRef<Webcam | null>(null);
  const SwalAlert = useSwalAlert();

  const [isUploading, setIsUploading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState(post?.profile_image);

  // 📌 อัพโหลดไฟล์
  const uploadFile = async (file: File) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('profile_image', file);

    setIsUploading(true);
    try {
      const res = await api.patch(API_URL.USERS_ME, formData);

      // ดึงข้อมูลรูปภาพจาก response (ปรับตามโครงสร้างจริงของหลังบ้านคุณ เช่น res.data.user หรือ res.data)
      const newProfileImage = res.data?.user?.profile_image;
        console.log('Upload response:', res);

      if (newProfileImage) {
        // เรียกฟังก์ชันรีโหลดข้อมูลหลัก (ถ้ามี)
        reload?.();

        // 💡 ทริคเด็ด: เติม ?t= timestamp ป้องกัน Browser ดึงรูปเก่าจาก cache
        const cacheBusterUrl = `${newProfileImage}?t=${new Date().getTime()}`;
        setImagePreview(cacheBusterUrl);

        SwalAlert.Toast({ title: 'อัพเดทรูปโปรไฟล์เรียบร้อย' });
      }
    } catch (error) {
      parseFetchError({
        error,
        onOtherError: () => SwalAlert.error(),
      });
    } finally {
      setIsUploading(false);
    }
  };

  // อัพเดทรูปภาพเมื่อ Props มีการเปลี่ยนแปลงจากภายนอก
  useEffect(() => {
    if (post?.profile_image) {
      // ป้องกันแคชตั้งแต่ตอนรับ Props เข้ามาด้วยเช่นกัน
      const cacheBusterUrl = `${post.profile_image}?t=${new Date().getTime()}`;
      setImagePreview(cacheBusterUrl);
    } else {
      setImagePreview(undefined);
    }
  }, [post?.profile_image]);

  // 📌 เลือกไฟล์จากเครื่อง
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  // 📌 เปิดกล้อง
  const openCamera = () => {
    setIsCameraOpen(true);
  };

  // 📌 ถ่ายภาพจากกล้อง
  const captureImage = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    fetch(imageSrc)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
        uploadFile(file);
      });

    setIsCameraOpen(false);
  };

  // 📌 ปิดกล้องและหยุด stream
  useEffect(() => {
    if (!isCameraOpen && webcamRef.current?.video?.srcObject) {
      const tracks = (webcamRef.current.video.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
  }, [isCameraOpen]);

  return (
    <div className="max-lg:w-full p-5 border border-gray-200 bg-white dark:bg-white/[0.03] shadow-lg rounded-2xl dark:border-gray-800 lg:p-8">
      <div className="flex flex-col items-center w-full gap-6">
        <div className="relative w-60 h-60 flex overflow-hidden rounded-full border dark:border-gray-700 bg-gray-300/[0.3] dark:bg-black/[0.8]">
          <span className="w-full h-full overflow-hidden">
            {isCameraOpen ? (
              <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" className="rounded-full object-cover w-full h-full" />
            ) : (
              <img
                key={imagePreview}
                src={imagePath(imagePreview)}
                alt="user"
                className="rounded-full object-contain w-full h-full"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/polipharm.png';
                }}
              />
            )}
          </span>

          {isUploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
              <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          {/* ปุ่มควบคุม */}
          <div className="absolute z-2 bottom-0 pt-2 pb-3 w-full flex justify-center gap-3 bg-gray-800/20">
            {!isCameraOpen ? (
              <>
                <Button
                  className="!rounded-full w-12 h-12"
                  variant={{ light: 'info-soft-outline', dark: 'info-soft-outline' }}
                  startIcon={<SolarCameraIcon className="size-8" />}
                  onClick={openCamera}
                  children
                />
                <Button
                  className="!rounded-full w-12 h-12"
                  variant={{ light: 'primary-soft-outline', dark: 'primary-soft-outline' }}
                  startIcon={<MaterialUploadIcon className="size-8" />}
                  onClick={() => fileInputRef.current?.click()}
                  children
                />
              </>
            ) : (
              <>
                <Button
                  className="!rounded-full w-12 h-12"
                  variant={{ light: 'success-soft-outline', dark: 'success-soft-outline' }}
                  startIcon={<IxCaptureIcon className="size-8" />}
                  onClick={captureImage}
                  children
                />
                <Button
                  className="!rounded-full w-12 h-12"
                  variant={{ light: 'error-soft-outline', dark: 'error-soft-outline' }}
                  startIcon={<CloseIcon className="size-8" />}
                  onClick={() => setIsCameraOpen(false)}
                  children
                />
              </>
            )}
          </div>

          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
        </div>

        <div className="flex flex-col text-center justify-center gap-1">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 xl:text-left">{post?.fullname}</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('page.users_profile.profile_image_card.username')}: {post?.username}
          </p>
          <span className="w-full">
            <Badge color="primary" variant="solid" className="max-w-30">
              {post?.role}
            </Badge>
          </span>
        </div>
      </div>
    </div>
  );
}
