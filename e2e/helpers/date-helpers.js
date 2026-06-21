/**
 * Утилиты для работы с датами в E2E тестах
 */
/** Форматирование даты в DD.MM.YYYY */
export function formatDateDDMMYYYY(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}
/** Форматирование даты в YYYY-MM-DD */
export function formatDateISO(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
}
/** Парсинг даты из DD.MM.YYYY */
export function parseDateDDMMYYYY(dateStr) {
    const [day, month, year] = dateStr.split('.').map(Number);
    return new Date(year, month - 1, day);
}
/** Парсинг даты из YYYY-MM-DD */
export function parseDateISO(dateStr) {
    return new Date(dateStr);
}
/** Добавление дней к дате */
export function addDays(date, days) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const result = new Date(d);
    result.setDate(result.getDate() + days);
    return result;
}
/** Добавление месяцев к дате */
export function addMonths(date, months) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const result = new Date(d);
    result.setMonth(result.getMonth() + months);
    return result;
}
/** Разница в днях между двумя датами */
export function daysBetween(date1, date2) {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}
/** Сравнение дат */
export function datesEqual(date1, date2) {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    return (d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate());
}
/** Получить текущую дату в формате YYYY-MM-DD */
export function todayISO() {
    return formatDateISO(new Date());
}
/** Получить текущую дату в формате DD.MM.YYYY */
export function todayDDMMYYYY() {
    return formatDateDDMMYYYY(new Date());
}
/** Получить дату N дней назад */
export function daysAgo(days) {
    return formatDateISO(addDays(new Date(), -days));
}
/** Получить дату через N дней */
export function daysFromNow(days) {
    return formatDateISO(addDays(new Date(), days));
}
/** Проверка что дата в прошлом */
export function isPastDate(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d < new Date();
}
/** Проверка что дата в будущем */
export function isFutureDate(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d > new Date();
}
/** Получить день недели для даты */
export function getDayOfWeek(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    return days[d.getDay()];
}
/** Форматирование диапазона дат */
export function formatDateRange(startDate, endDate) {
    return `${formatDateDDMMYYYY(startDate)} — ${formatDateDDMMYYYY(endDate)}`;
}
