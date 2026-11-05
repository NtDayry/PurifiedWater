import { useState, useCallback, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import { useDropzone } from 'react-dropzone';
import Button from '@/components/ui/button/Button';
import { SolarCameraIcon, MaterialUploadIcon, IxCaptureIcon, CloseIcon } from '@/icons';
import clsx from 'clsx';

interface DropzoneProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  onFileChange?: (file: File | null) => void;
  title?: string;
  activeTitle?: string;
  subTitle?: string;
  image?: string;
  facingMode?: 'user' | 'environment';
}

const DropzoneComponent: React.FC<DropzoneProps> = ({ onFileChange, title, activeTitle, subTitle, image, facingMode = 'user', className, ...rest }) => {
  const [preview, setPreview] = useState<string | null>(image || null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const webcamRef = useRef<Webcam | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const selectedFile = acceptedFiles[0];
        setPreview(URL.createObjectURL(selectedFile));
        onFileChange?.(selectedFile);
      }
    },
    [onFileChange]
  );

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'image/*': [],
      'image/png': [],
      'image/jpeg': [],
      'image/webp': [],
      'image/svg+xml': [],
    },
  });

  const handleClear = () => {
    setPreview(null);
    onFileChange?.(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onFileChange?.(file);
    }
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
        onDrop([file]);
      });

    setIsCameraOpen(false);
  };

  useEffect(() => {
    if (image) {
      setPreview(null);
      setPreview(image);
    }

    if (!isCameraOpen && webcamRef.current?.video?.srcObject) {
      const tracks = (webcamRef.current.video.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
  }, [image, isCameraOpen]);

  return (
    <div
      {...getRootProps()}
      {...rest}
      className={clsx(
        `relative transition ${preview ? 'border-none' : 'border'} border-gray-300 hover:border-brand-500 border-dashed cursor-pointer rounded-xl overflow-hidden
        ${isDragActive ? 'border-brand-500 bg-gray-100' : 'border-gray-300 bg-gray-100'}
        dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500`,
        className
      )}
      style={{ minHeight: '275px' }}
    >
      {/* Hidden Inputs */}
      {/* <input
        {...getInputProps()}
        style={{ display: 'none' }}
      /> */}
      <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />

      {isCameraOpen ? (
        <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode }} className="object-cover" />
      ) : !preview ? (
        <div className="dz-message flex flex-col items-center justify-center h-full p-7 lg:p-10">
          <div className="mb-[22px] flex justify-center">
            <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-400">
              <svg className="fill-current" width="29" height="28" viewBox="0 0 29 28" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M14.5 3.917a.75.75 0 0 0-.55.239l-5.38 5.376a.75.75 0 1 0 1.06 1.061L13.75 6.478V18.667a.75.75 0 1 0 1.5 0V6.482l4.114 4.11a.75.75 0 0 0 1.061-1.061L15.084 4.194a.75.75 0 0 0-.583-.277ZM5.916 18.667a.75.75 0 0 0-1.5 0v3.167a2.25 2.25 0 0 0 2.25 2.25h15.668a2.25 2.25 0 0 0 2.25-2.25v-3.167a.75.75 0 0 0-1.5 0v3.167a.75.75 0 0 1-.75.75H6.666a.75.75 0 0 1-.75-.75v-3.167Z"
                />
              </svg>
            </div>
          </div>
          <h4 className="mb-3 font-semibold text-gray-800 text-theme-xl dark:text-white/90">{isDragActive ? activeTitle || 'Drop Files Here' : title || 'Drag & Drop Files Here'}</h4>
          <span className="text-center mb-5 block w-full max-w-[290px] text-sm text-gray-700 dark:text-gray-400">{subTitle || 'ลากและวางไฟล์ PNG, JPG, images ตรงนี้'}</span>
        </div>
      ) : (
        <>
          <img
            src={preview}
            alt="Preview"
            className="animate-fadeIn absolute inset-0 w-full h-full object-cover hover:scale-120 transition-all duration-500"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/images/error/error.png';
            }}
          />
          <div className="absolute top-3 right-3">
            <Button className="!rounded-full w-12 h-12" variant={{ light: 'error', dark: 'error' }} startIcon={<CloseIcon className="size-8" />} onClick={handleClear} children />
          </div>
        </>
      )}

      {/* ปุ่มควบคุม */}
      {(isCameraOpen || !preview) && (
        <div className="absolute z-2 bottom-0 pt-2 pb-3 w-full flex justify-center gap-3 bg-gray-800/50">
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
                variant={{ light: 'warning-soft-outline', dark: 'warning-soft-outline' }}
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
      )}
    </div>
  );
};

export default DropzoneComponent;
