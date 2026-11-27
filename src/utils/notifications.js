import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const CHANNEL_ID = 'medicamentos-alta-prioridad';

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
    // Crear canal de alta prioridad en Android 8+
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Recordatorios de Medicamentos',
        description: 'Avisos puntuales para tomar tus medicamentos',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3D99F5',
        sound: 'default',
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('Error configurando notificaciones:', error);
    return false;
  }
}

// Programa las próximas 10 tomas exactas en el segundo :00
export async function programarColaNotificaciones({ nombre, dosis, proximaTomaISO, cadaHoras }) {
  const ids = [];
  const baseDate = new Date(proximaTomaISO);
  baseDate.setSeconds(0, 0);
  const baseTime = baseDate.getTime();

  const intervaloMs = Number(cadaHoras) * 60 * 60 * 1000;
  const ahora = Date.now();

  let salto = 0;
  while (ids.length < 10) {
    const fechaDisparo = new Date(baseTime + salto * intervaloMs);
    fechaDisparo.setSeconds(0, 0);
    salto++;

    if (fechaDisparo.getTime() <= ahora) continue;

    const mensajeFn = MENSAJES_AMIGABLES[(ids.length + nombre.length) % MENSAJES_AMIGABLES.length];

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `CareRemind • ${nombre}`,
        body: mensajeFn(nombre, dosis),
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fechaDisparo,
        channelId: CHANNEL_ID,
      },
    });

    ids.push(id);
  }

  return ids;
}

export async function enviarNotificacionPrueba() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'CareRemind • Prueba de aviso 💙',
      body: '✨ ¡Todo listo! Así llegarán tus recordatorios aunque la app esté cerrada.',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 5000),
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelarNotificaciones(ids = []) {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (_) {}
  }
}