const madridFormat = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

/** Hora actual en Madrid, venga de donde venga la visita. */
export function madridTime(date = new Date()) {
    const parts = Object.fromEntries(madridFormat.formatToParts(date).map((p) => [p.type, p.value]));
    return {
        h: Number(parts.hour),
        m: Number(parts.minute),
        s: Number(parts.second),
        label: `${parts.hour}:${parts.minute}`,
    };
}
