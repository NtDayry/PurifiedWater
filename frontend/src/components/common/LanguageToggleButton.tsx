import { useLanguageStore } from '@/store/language';
import { LangTH, LangEN } from '@/icons';

export const LanguageToggleButton: React.FC<{ size?: number }> = ({ size = 10 }) => {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  // const handleChangeLanguage = (lang: string) => i18n.changeLanguage(lang)
  const handleChangeLanguage = () => {
    const _lang = language == 'th' ? 'en' : 'th';
    setLanguage(_lang);
  };

  const sizeClass = `h-${size} w-${size}`;
  const iconProps = `size-${size}`;

  return (
    <button
      onClick={handleChangeLanguage}
      className={`relative flex items-center justify-center text-white transition-colors border border-gray-200 rounded-full hover:text-gray-300 ${sizeClass}`}
    >
      {language == 'th' ? <LangTH className={iconProps} /> : <LangEN className={iconProps} />}
      <span className="absolute text-lg font-bold">{language.toUpperCase()}</span>
    </button>
  );
};
