import { useEffect, useState, useRef, memo } from 'react';
import { SensorReportResponse } from '@_types/sensor';
import type { AlertRule, SensorConfig } from '@/api';
import Button from '../ui/button/Button';
import { SectionHeader } from '@/components/ui/widget';
import AreaChart from '@/components/charts/area';
import { Collapse } from '../ui/collapse/Collapse';
import { ChevronDownIcon } from '@/icons';
import { sensorStore, getSensorColor, COLOR_PRESETS, sortGroupTree } from './reportUtils';

// ==========================
// Real-time value
// ==========================
export const RealTimeValue = memo(
  ({ sensorKey, unit, color, decimal_places }: { sensorKey: string; unit: string; color: string; decimal_places: number }) => {
    const [, forceUpdate] = useState({});

    useEffect(() => {
      const unsubscribe = sensorStore.subscribe(() => {
        forceUpdate({});
      });

      return () => {
        unsubscribe();
      };
    }, []);

    const value = sensorStore.getSnapshot(sensorKey);
    const hasValue = typeof value === 'number' && !isNaN(value);

    return (
      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700/60">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${hasValue ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}
          ></span>
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${hasValue ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
        </span>
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Live:</span>
        <h3 className="text-sm sm:text-base font-bold tracking-tight" style={{ color: color ?? '#2b4aff' }}>
          {hasValue ? value.toFixed(decimal_places ?? 2) : '---'}{' '}
          <span className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400">{unit}</span>
        </h3>
      </div>
    );
  }
);
RealTimeValue.displayName = 'RealTimeValue';

// ==========================
// Color Picker Popover
// ==========================
export const ColorPickerPopover = memo(
  ({ currentColor, onChange, onReset }: { currentColor: string; onChange: (color: string) => void; onReset: () => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen]);

    return (
      <div className="relative inline-block text-left" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Custom Chart Color"
        >
          <span className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: currentColor }}></span>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Color</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-48 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 animate-fadeIn">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2 flex justify-between items-center">
              <span>Chart Color</span>
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setIsOpen(false);
                }}
                className="text-[10px] text-gray-400 hover:text-brand-500 underline"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                    currentColor.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-offset-1 ring-brand-500' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onChange(color);
                    setIsOpen(false);
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Custom:</span>
              <input
                type="color"
                value={currentColor}
                onChange={(e) => onChange(e.target.value)}
                className="w-7 h-7 p-0 border-0 rounded cursor-pointer bg-transparent"
              />
              <span className="text-[10px] font-mono text-gray-400 uppercase">{currentColor}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);
ColorPickerPopover.displayName = 'ColorPickerPopover';

// ==========================
// SensorGroupCard
// ==========================
export const SensorGroupCard = memo(
  ({
    group,
    categories,
    sensorConfigsMap,
    alertRulesMap,
    customColors,
    onColorChange,
    onColorReset,
    defaultOpen = false,
  }: {
    group: any;
    categories: string[];
    sensorConfigsMap: Record<string, SensorConfig>;
    alertRulesMap: Record<string, AlertRule>;
    customColors: Record<string, string>;
    onColorChange: (sensorKey: string, color: string) => void;
    onColorReset: (sensorKey: string) => void;
    defaultOpen?: boolean;
  }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const renderGroup = (group: any) => {
      return (
        <div key={group.group_key} className="grid grid-cols-1 lg:grid-cols-1 gap-8">
          {/* Children */}
          {group.children?.length > 0 && <div className="space-y-6">{group.children.map((child: any) => renderGroup(child))}</div>}

          {/* Sensors */}
          {group.sensors?.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {group.sensors.map((sensor: any) => {
                const activeColor = getSensorColor(sensor.key, customColors, sensor.color);
                const sensorConfig = sensorConfigsMap[sensor.key];
                const alertRule = alertRulesMap[sensor.key];
                const warningMin = sensor.alert_min ?? alertRule?.threshold_min ?? sensorConfig?.alert_min;
                const warningMax = sensor.alert_max ?? alertRule?.threshold_max ?? sensorConfig?.alert_max;

                return (
                  <div key={sensor.key} className="rounded-2xl border border-gray-200 bg-white px-3 ps-0 dark:border-gray-800 dark:bg-gray-800">
                    <AreaChart
                      key={`${group.group_key}-${sensor.key}-${JSON.stringify(sensor.values)}-${activeColor}`}
                      id={sensor.key}
                      categories={categories}
                      series={[
                        {
                          name: sensor.name,
                          data: sensor.values ?? [],
                        },
                      ]}
                      height={230}
                      // min={sensor.statistics?.min?.toFixed(sensor.decimal_places || 1)}
                      // max={sensor.statistics?.max?.toFixed(sensor.decimal_places || 1)}
                      avg={sensor.statistics?.avg?.toFixed(sensor.decimal_places || 1)}
                      warningMin={warningMin}
                      warningMax={warningMax}
                      options={{ colors: [activeColor] }}
                      label={
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 sm:p-5 pb-0 gap-3 sm:gap-0">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm sm:text-base font-bold text-gray-800 dark:text-white/[0.9]">{sensor.name}</h3>
                              <ColorPickerPopover
                                currentColor={activeColor}
                                onChange={(c) => onColorChange(sensor.key, c)}
                                onReset={() => onColorReset(sensor.key)}
                              />
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1">
                              <span className="text-xs sm:text-sm text-warning-500 font-semibold">
                                min: {sensor.statistics?.min?.toFixed(sensor.decimal_places || 1) ?? '---'}
                              </span>
                              <span className="text-xs sm:text-sm text-error-500 font-semibold">
                                max: {sensor.statistics?.max?.toFixed(sensor.decimal_places || 1) ?? '---'}
                              </span>
                              <span className="text-xs sm:text-sm text-blue-500 font-semibold">
                                avg: {sensor.statistics?.avg?.toFixed(sensor.decimal_places || 1) ?? '---'}
                              </span>
                            </div>
                          </div>
                          <RealTimeValue sensorKey={sensor.key} color={activeColor} unit={sensor.unit} decimal_places={sensor.decimal_places} />
                        </div>
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800/[0.3] md:p-6">
        <div className="flex justify-between items-center">
          <SectionHeader title={group.group_name} subtitle={group.sub_group_name} accent="#818cf8" className="!mb-0" />
          <Button variant="link" size="sm" className="!text-gray-500" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? 'Hide Details' : 'Show Details'}
            <ChevronDownIcon className={`ml-auto w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-500' : ''}`} />
          </Button>
        </div>

        <Collapse isOpen={isOpen}>{isOpen && renderGroup(group)}</Collapse>
      </div>
    );
  }
);
SensorGroupCard.displayName = 'SensorGroupCard';

// ==========================
// Main Report Charts View
// ==========================
interface ReportChartsProps {
  sensorData: SensorReportResponse;
  sensorConfigs?: SensorConfig[];
  alertRules?: AlertRule[];
  customColors: Record<string, string>;
  onColorChange: (sensorKey: string, color: string) => void;
  onColorReset: (sensorKey: string) => void;
}

export const ReportCharts = memo(({ sensorData, sensorConfigs = [], alertRules = [], customColors, onColorChange, onColorReset }: ReportChartsProps) => {
  const sensorConfigsMap = sensorConfigs.reduce<Record<string, SensorConfig>>((acc, config) => {
    acc[config.metric_name] = config;
    return acc;
  }, {});

  const alertRulesMap = alertRules.reduce<Record<string, AlertRule>>((acc, rule) => {
    acc[rule.metric_name] = rule;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {[...sensorData.data]
        .map(sortGroupTree)
        .sort((a, b) => a.group_index - b.group_index)
        .map((group: any, index: number) => (
          <SensorGroupCard
            key={group.group_key}
            group={group}
            categories={sensorData.meta.timestamps}
            sensorConfigsMap={sensorConfigsMap}
            alertRulesMap={alertRulesMap}
            customColors={customColors}
            onColorChange={onColorChange}
            onColorReset={onColorReset}
            defaultOpen={index === 0}
          />
        ))}
    </div>
  );
});
ReportCharts.displayName = 'ReportCharts';

export default ReportCharts;
