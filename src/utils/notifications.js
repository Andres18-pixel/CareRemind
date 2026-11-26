import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const MENSAJES_AMIGABLES = [
  (nombre, dosis) => `💊 Hora de cuidarte: toca tu ${nombre} (${dosis}).`,
  (nombre, dosis) => `✨ Pequeño recordatorio con cariño: es momento de tu ${nombre} (${dosis}).`,
  (nombre, dosis) => `🌿 ¡Tu salud primero! No olvides tomar ${dosis} de ${nombre}.`,
  (nombre, dosis) => `💙 Recordatorio de CareRemind: ya es hora de tu ${nombre} (${dosis}).`,
];

export async function configurarNotificaciones() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    return false;
  }
}

// Programa las próximas 5 tomas exactas en el segundo :00
export async function programarColaNotificaciones({ nombre, dosis, proximaTomaISO, cadaHoras }) {
  const ids = [];
  const baseDate = new Date(proximaTomaISO);
  baseDate.setSeconds(0, 0);
  const baseTime = baseDate.getTime();

  const intervaloMs = Number(cadaHoras) * 60 * 60 * 1000;
  const ahora = Date.now();

  let salto = 0;
  while (ids.length < 5) {
    const fechaDisparo = new Date(baseTime + salto * intervaloMs);
    fechaDisparo.setSeconds(0, 0);
    salto++;

    if (fechaDisparo.getTime() <= ahora) continue;

    const mensajeFn = MENSAJES_AMIGABLES[(ids.length + nombre.length) % MENSAJES_AMIGABLES.length];

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `CareRemind • ${nombre}`,
        body: mensajeFn(nombre, dosis),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fechaDisparo,
      },
    });

    ids.push(id);
  }

  return ids;
}

export async function cancelarNotificaciones(ids = []) {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (_) {}
  }
}