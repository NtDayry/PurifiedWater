import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import i18n from '@/i18n'

type Language = 'th' | 'en'

interface LanguageStore {
    language: Language
    setLanguage: (lang: Language) => void
}

export const useLanguageStore =
    create<LanguageStore>()(
        persist(
            (set) => ({
                language: 'th',

                setLanguage: (lang) => {
                    i18n.changeLanguage(lang)

                    set({
                        language: lang,
                    })
                },
            }),

            {
                name: 'language-storage',
            }
        )
    )