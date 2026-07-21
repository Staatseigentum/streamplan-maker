import { DAY_NAMES } from "../../shared/constants.js";

export function createDayEntry({ day, startTime, endTime = null, durationMinutes = null, label = null }) {
  return { day, startTime, endTime, durationMinutes, label };
}

export function dayEntryToDict(entry) {
  return {
    day: entry.day,
    start_time: entry.startTime,
    end_time: entry.endTime,
    duration_minutes: entry.durationMinutes,
    label: entry.label,
  };
}

export function dayEntryFromDict(data) {
  return createDayEntry({
    day: data.day,
    startTime: data.start_time,
    endTime: data.end_time ?? null,
    durationMinutes: data.duration_minutes ?? null,
    label: data.label ?? null,
  });
}

export function endDisplay(entry) {
  if (entry.endTime) return entry.endTime;
  if (entry.durationMinutes) {
    const hours = Math.floor(entry.durationMinutes / 60);
    const minutes = entry.durationMinutes % 60;
    if (hours && minutes) return `+${hours}h ${minutes}m`;
    if (hours) return `+${hours}h`;
    return `+${minutes}m`;
  }
  return null;
}

export function createStreamerProfile({ displayName = "", days = [] } = {}) {
  return { displayName, days };
}

export function sortedDays(profile) {
  const order = new Map(DAY_NAMES.map((name, i) => [name, i]));
  return [...profile.days].sort((a, b) => (order.get(a.day) ?? 99) - (order.get(b.day) ?? 99));
}

export function profileToDict(profile) {
  return {
    display_name: profile.displayName,
    days: profile.days.map(dayEntryToDict),
  };
}

export function profileFromDict(data) {
  return createStreamerProfile({
    displayName: data.display_name || "",
    days: (data.days || []).map(dayEntryFromDict),
  });
}
