import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/modal';
import Input from '@/components/form/input/InputField';
import Button from '@/components/ui/button/Button';
import useSwalAlert from '@/hooks/useSwalAlert';
import {
  getAlertRules,
  upsertAlertRule,
  getNotificationSettings,
  type AlertRulePayload,
  type SensorConfig,
  type NotificationSettings,
} from '@/api';

interface SensorAlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SensorConfig | null;
  metricLabel: string;
  groupName: string;
  onSaveSuccess?: () => void;
}

export const SensorAlarmModal: React.FC<SensorAlarmModalProps> = ({
  isOpen,
  onClose,
  config,
  metricLabel,
  groupName,
  onSaveSuccess,
}) => {
  const { t } = useTranslation();
  const swal = useSwalAlert();

  const [activeTab, setActiveTab] = useState<'thresholds' | 'notifications'>('thresholds');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [ruleId, setRuleId] = useState<number | undefined>(undefined);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [thresholdMin, setThresholdMin] = useState<string>('');
  const [thresholdMax, setThresholdMax] = useState<string>('');
  const [sustainedSeconds, setSustainedSeconds] = useState<number>(300);
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning');

  // Notification & Logging options
  const [notifyWeb, setNotifyWeb] = useState<boolean>(true);
  const [saveAlarm, setSaveAlarm] = useState<boolean>(true);
  const [notifyLine, setNotifyLine] = useState<boolean>(false);
  const [notifyEmail, setNotifyEmail] = useState<boolean>(false);

  // Global Notification Settings state for info display
  const [globalNotifSettings, setGlobalNotifSettings] = useState<NotificationSettings | null>(null);

  const fetchExistingRule = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const [rules, notifSettings] = await Promise.all([
        getAlertRules(config.device_name, config.metric_name),
        getNotificationSettings().catch(() => null),
      ]);

      if (notifSettings) {
        setGlobalNotifSettings(notifSettings);
      }

      if (rules.length > 0) {
        const r = rules[0];
        setRuleId(r.id);
        setIsActive(r.is_active);
        setThresholdMin(r.threshold_min !== null && r.threshold_min !== undefined ? String(r.threshold_min) : '');
        setThresholdMax(r.threshold_max !== null && r.threshold_max !== undefined ? String(r.threshold_max) : '');
        setSustainedSeconds(r.sustained_seconds ?? 300);
        setSeverity((r.severity as any) || 'warning');
        setNotifyWeb(r.notify_web ?? true);
        setSaveAlarm(r.save_alarm ?? true);
        setNotifyLine(r.notify_line ?? false);
        setNotifyEmail(r.notify_email ?? false);
      } else {
        // Reset defaults
        setRuleId(undefined);
        setIsActive(true);
        setThresholdMin(config.range_min ? String(config.range_min) : '');
        setThresholdMax(config.range_max ? String(config.range_max) : '');
        setSustainedSeconds(300);
        setSeverity('warning');
        setNotifyWeb(true);
        setSaveAlarm(true);
        setNotifyLine(false);
        setNotifyEmail(false);
      }
    } catch (err) {
      swal.error({
        title: t('page.settings_devices.alarm_modal.swal.fetch_error_title'),
        message: t('page.settings_devices.alarm_modal.swal.fetch_error_msg'),
      });
    } finally {
      setLoading(false);
    }
  }, [config, t]);

  useEffect(() => {
    if (isOpen && config) {
      setActiveTab('thresholds');
      fetchExistingRule();
    }
  }, [isOpen, config, fetchExistingRule]);

  if (!config) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: AlertRulePayload = {
        device_name: config.device_name,
        metric_name: config.metric_name,
        threshold_min: thresholdMin !== '' ? Number(thresholdMin) : null,
        threshold_max: thresholdMax !== '' ? Number(thresholdMax) : null,
        sustained_seconds: Number(sustainedSeconds),
        severity,
        notify_web: notifyWeb,
        notify_line: notifyLine,
        notify_email: notifyEmail,
        save_alarm: saveAlarm,
        line_token: null, // Uses global Notification Settings
        email_recipients: null, // Uses global Notification Settings
        is_active: isActive,
      };

      await upsertAlertRule(payload);
      swal.Toast({
        title: t('page.settings_devices.alarm_modal.swal.save_success_title', { metric: metricLabel }),
        icon: 'success',
      });
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      swal.error({
        title: t('page.settings_devices.alarm_modal.swal.save_error_title'),
        message: t('page.settings_devices.alarm_modal.swal.save_error_msg'),
      });
    } finally {
      setSaving(false);
    }
  };

  const minVal = thresholdMin !== '' ? Number(thresholdMin) : null;
  const maxVal = thresholdMax !== '' ? Number(thresholdMax) : null;

  const hasGlobalLineToken = !!globalNotifSettings?.line_token;
  const hasGlobalEmailRecipients = !!globalNotifSettings?.email_recipients;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" animation="zoom">
      <div className="p-6 space-y-5 w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {t('page.settings_devices.alarm_modal.badge')}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {groupName} {ruleId ? `(#${ruleId})` : ''}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1">
              {metricLabel} <span className="text-sm font-normal text-gray-500">({config.metric_name})</span>
            </h3>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('thresholds')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'thresholds'
                ? 'border-primary text-primary dark:text-sky-400 dark:border-sky-400 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            {t('page.settings_devices.alarm_modal.tabs.thresholds')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'notifications'
                ? 'border-primary text-primary dark:text-sky-400 dark:border-sky-400 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {t('page.settings_devices.alarm_modal.tabs.notifications')}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <span className="animate-pulse">{t('page.settings_devices.alarm_modal.loading')}</span>
          </div>
        ) : (
          <>
            {/* TAB 1: Threshold Settings (Current Page Intact) */}
            {activeTab === 'thresholds' && (
              <div className="gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => {
                        const is_active = e.target.checked;
                        setIsActive(is_active);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-500"></div>
                  </label>
                  <div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white block leading-tight">
                      {isActive
                        ? t('page.settings_devices.alarm_modal.thresholds.alarm_active')
                        : t('page.settings_devices.alarm_modal.thresholds.alarm_inactive')}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {isActive
                        ? t('page.settings_devices.alarm_modal.thresholds.alarm_active_desc')
                        : t('page.settings_devices.alarm_modal.thresholds.alarm_inactive_desc')}
                    </span>
                  </div>
                </div>
                <div className="space-y-5 animate-[fadeIn_0.2s_ease-out] mt-4">
                  {/* Threshold Limits Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Low Threshold */}
                    <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                          {t('page.settings_devices.alarm_modal.thresholds.low_threshold_title')}
                        </span>
                        <span className="text-[10px] text-sky-600 font-mono">
                          {t('page.settings_devices.alarm_modal.thresholds.low_below_alert')}
                        </span>
                      </div>
                      <Input
                        type="number"
                        placeholder={t('page.settings_devices.alarm_modal.thresholds.low_placeholder')}
                        value={thresholdMin}
                        onChange={(e) => setThresholdMin(e.target.value)}
                        className="text-xs font-mono"
                      />
                      <span className="text-[11px] text-gray-400">
                        {thresholdMin !== ''
                          ? t('page.settings_devices.alarm_modal.thresholds.low_desc_alert', {
                              val: `${thresholdMin} ${config.unit ?? ''}`,
                            })
                          : t('page.settings_devices.alarm_modal.thresholds.unspecified')}
                      </span>
                    </div>

                    {/* High Threshold */}
                    <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                          {t('page.settings_devices.alarm_modal.thresholds.high_threshold_title')}
                        </span>
                        <span className="text-[10px] text-rose-600 font-mono">
                          {t('page.settings_devices.alarm_modal.thresholds.high_above_alert')}
                        </span>
                      </div>
                      <Input
                        type="number"
                        placeholder={t('page.settings_devices.alarm_modal.thresholds.high_placeholder')}
                        value={thresholdMax}
                        onChange={(e) => setThresholdMax(e.target.value)}
                        className="text-xs font-mono"
                      />
                      <span className="text-[11px] text-gray-400">
                        {thresholdMax !== ''
                          ? t('page.settings_devices.alarm_modal.thresholds.high_desc_alert', {
                              val: `${thresholdMax} ${config.unit ?? ''}`,
                            })
                          : t('page.settings_devices.alarm_modal.thresholds.unspecified')}
                      </span>
                    </div>
                  </div>

                  {/* Visual Zone Bar */}
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 block">
                      {t('page.settings_devices.alarm_modal.thresholds.visual_preview')}
                    </span>
                    <div className="flex items-center gap-2 text-xs font-mono justify-between text-gray-400">
                      <span>
                        {minVal !== null
                          ? t('page.settings_devices.alarm_modal.thresholds.low_tag', { val: minVal })
                          : t('page.settings_devices.alarm_modal.thresholds.no_min_limit')}
                      </span>
                      <span className="text-emerald-500 font-bold">
                        {t('page.settings_devices.alarm_modal.thresholds.normal_zone')}
                      </span>
                      <span>
                        {maxVal !== null
                          ? t('page.settings_devices.alarm_modal.thresholds.high_tag', { val: maxVal })
                          : t('page.settings_devices.alarm_modal.thresholds.no_max_limit')}
                      </span>
                    </div>
                    <div className="flex w-full h-5 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700">
                      <div className="w-1/4 bg-sky-500/40 text-[9px] text-white pt-1 flex items-center justify-center font-bold">
                        {t('page.settings_devices.alarm_modal.thresholds.bar_low')}
                      </div>
                      <div className="w-2/4 bg-emerald-500/70 text-[9px] text-white pt-1 flex items-center justify-center font-bold">
                        {t('page.settings_devices.alarm_modal.thresholds.bar_normal')}
                      </div>
                      <div className="w-1/4 bg-rose-500/70 text-[9px] text-white flex pt-1 items-center justify-center font-bold">
                        {t('page.settings_devices.alarm_modal.thresholds.bar_high')}
                      </div>
                    </div>
                  </div>

                  {/* Delay & Severity */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-300 font-medium block mb-1">
                        {t('page.settings_devices.alarm_modal.thresholds.trigger_delay_label')}
                      </label>
                      <select
                        value={sustainedSeconds}
                        onChange={(e) => setSustainedSeconds(Number(e.target.value))}
                        className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                      >
                        <option value={0}>{t('page.settings_devices.alarm_modal.thresholds.delay_instant')}</option>
                        <option value={30}>{t('page.settings_devices.alarm_modal.thresholds.delay_30s')}</option>
                        <option value={60}>{t('page.settings_devices.alarm_modal.thresholds.delay_1m')}</option>
                        <option value={300}>{t('page.settings_devices.alarm_modal.thresholds.delay_5m')}</option>
                        <option value={600}>{t('page.settings_devices.alarm_modal.thresholds.delay_10m')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-300 font-medium block mb-1 md:mb-5">
                        {t('page.settings_devices.alarm_modal.thresholds.severity_label')}
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as any)}
                        className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                      >
                        <option value="info">{t('page.settings_devices.alarm_modal.thresholds.severity_info')}</option>
                        <option value="warning">{t('page.settings_devices.alarm_modal.thresholds.severity_warning')}</option>
                        <option value="critical">{t('page.settings_devices.alarm_modal.thresholds.severity_critical')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Notifications & Logging */}
            {activeTab === 'notifications' && (
              <div className="space-y-3.5 animate-[fadeIn_0.2s_ease-out]">
                {/* Active Web Notify */}
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div className="space-y-1 pr-4">
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {t('page.settings_devices.alarm_modal.notifications.web_notify_title')}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <span className={notifyWeb ? "font-semibold text-sky-600 dark:text-sky-400" : "font-semibold text-gray-400"}>
                        {notifyWeb
                          ? t('page.settings_devices.alarm_modal.notifications.enabled')
                          : t('page.settings_devices.alarm_modal.notifications.disabled')}
                      </span>
                      {notifyWeb
                        ? t('page.settings_devices.alarm_modal.notifications.web_notify_enabled_desc')
                        : t('page.settings_devices.alarm_modal.notifications.web_notify_disabled_desc')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={notifyWeb}
                      onChange={(e) => setNotifyWeb(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sky-500 dark:peer-checked:bg-sky-500"></div>
                  </label>
                </div>

                {/* Save Alarm Log Option */}
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div className="space-y-1 pr-4">
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      {t('page.settings_devices.alarm_modal.notifications.save_alarm_title')}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <span className={saveAlarm ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-gray-400"}>
                        {saveAlarm
                          ? t('page.settings_devices.alarm_modal.notifications.enabled')
                          : t('page.settings_devices.alarm_modal.notifications.disabled')}
                      </span>
                      {saveAlarm
                        ? t('page.settings_devices.alarm_modal.notifications.save_alarm_enabled_desc')
                        : t('page.settings_devices.alarm_modal.notifications.save_alarm_disabled_desc')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={saveAlarm}
                      onChange={(e) => setSaveAlarm(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* LINE Notify Option */}
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div className="space-y-1 pr-4">
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {t('page.settings_devices.alarm_modal.notifications.line_notify_title')}
                      <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {t('page.settings_devices.alarm_modal.notifications.global_badge')}
                      </span>
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <span className={notifyLine ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-gray-400"}>
                        {notifyLine
                          ? t('page.settings_devices.alarm_modal.notifications.enabled')
                          : t('page.settings_devices.alarm_modal.notifications.disabled')}
                      </span>
                      {notifyLine
                        ? (hasGlobalLineToken
                            ? t('page.settings_devices.alarm_modal.notifications.line_notify_enabled_desc_with_token')
                            : t('page.settings_devices.alarm_modal.notifications.line_notify_enabled_desc_no_token'))
                        : t('page.settings_devices.alarm_modal.notifications.line_notify_disabled_desc')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={notifyLine}
                      onChange={(e) => setNotifyLine(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Email Notification Option */}
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div className="space-y-1 pr-4">
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {t('page.settings_devices.alarm_modal.notifications.email_notify_title')}
                      <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        {t('page.settings_devices.alarm_modal.notifications.global_badge')}
                      </span>
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <span className={notifyEmail ? "font-semibold text-amber-600 dark:text-amber-400" : "font-semibold text-gray-400"}>
                        {notifyEmail
                          ? t('page.settings_devices.alarm_modal.notifications.enabled')
                          : t('page.settings_devices.alarm_modal.notifications.disabled')}
                      </span>
                      {notifyEmail
                        ? (hasGlobalEmailRecipients
                            ? t('page.settings_devices.alarm_modal.notifications.email_notify_enabled_desc_with_recipients')
                            : t('page.settings_devices.alarm_modal.notifications.email_notify_enabled_desc_no_recipients'))
                        : t('page.settings_devices.alarm_modal.notifications.email_notify_disabled_desc')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-500 dark:peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
          <Button variant="error" onClick={onClose} disabled={saving} className="text-xs">
            {t('page.settings_devices.alarm_modal.actions.cancel')}
          </Button>
          <Button variant={{ light: 'primary', dark: 'primary' }} onClick={handleSave} disabled={saving || loading} className="text-xs min-w-[120px]">
            {saving ? t('page.settings_devices.alarm_modal.actions.saving') : t('page.settings_devices.alarm_modal.actions.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

