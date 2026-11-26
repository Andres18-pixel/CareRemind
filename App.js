import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  Alert,
  StatusBar,
  Platform,
  SafeAreaView,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { COLORS } from './src/theme/colors';
import {
  configurarNotificaciones,
  programarColaNotificaciones,
  cancelarNotificaciones,
} from './src/utils/notifications';
import {
  obtenerMedicamentos,
  guardarMedicamentos,
  obtenerHistorial,
  registrarTomaEnHistorial,
  eliminarRegistroHistorial,
  limpiarTodoHistorial,
} from './src/utils/storage';

const INTERVALOS_RAPIDOS = ['6', '8', '10', '12', '24'];

// Si hay segundos extra (ej. 12:10:45), redondea hacia arriba al minuto siguiente (12:11:00)
function redondearAlMinutoExacto(fecha) {
  const d = new Date(fecha.getTime());
  if (d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setMinutes(d.getMinutes() + 1);
  }
  d.setSeconds(0, 0);
  return d;
}

export default function App() {
  const [pestanaActiva, setPestanaActiva] = useState('pastillas');
  const [medicamentos, setMedicamentos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [medicamentoEditandoId, setMedicamentoEditandoId] = useState(null);

  // Estados del formulario
  const [nombre, setNombre] = useState('');
  const [dosis, setDosis] = useState('1 pastilla');
  const [cadaHoras, setCadaHoras] = useState('8');
  const [cantidadTotal, setCantidadTotal] = useState('20');
  const [modoHora, setModoHora] = useState('ahora'); // 'ahora' | 'especifica' | 'mantener'
  const [horaInicioTexto, setHoraInicioTexto] = useState('08:00');
  const [nota, setNota] = useState('');

  useEffect(() => {
    inicializarApp();
  }, []);

  async function inicializarApp() {
    const permisoOk = await configurarNotificaciones();
    if (!permisoOk) {
      Alert.alert(
        'Permiso necesario',
        'Activa las notificaciones para que CareRemind pueda avisarte a tiempo de tus medicamentos.'
      );
    }
    const medsGuardados = await obtenerMedicamentos();
    const histGuardado = await obtenerHistorial();
    setMedicamentos(medsGuardados);
    setHistorial(histGuardado);
  }

  function limpiarFormulario() {
    setMedicamentoEditandoId(null);
    setNombre('');
    setDosis('1 pastilla');
    setCadaHoras('8');
    setCantidadTotal('20');
    setModoHora('ahora');
    setHoraInicioTexto('08:00');
    setNota('');
  }

  function abrirModalCrear() {
    limpiarFormulario();
    setModalVisible(true);
  }

  function abrirModalEditar(med) {
    setMedicamentoEditandoId(med.id);
    setNombre(med.nombre);
    setDosis(med.dosis);
    setCadaHoras(String(med.cadaHoras));
    setCantidadTotal(String(med.restantes));
    setNota(med.nota || '');

    const fechaActual = new Date(med.proximaTomaISO);
    const hh = String(fechaActual.getHours()).padStart(2, '0');
    const mm = String(fechaActual.getMinutes()).padStart(2, '0');
    setHoraInicioTexto(`${hh}:${mm}`);
    setModoHora('mantener');

    setModalVisible(true);
  }

  function calcularPrimeraToma(medExistente = null) {
    if (modoHora === 'mantener' && medExistente) {
      const fechaGuardada = redondearAlMinutoExacto(new Date(medExistente.proximaTomaISO));
      if (fechaGuardada.getTime() > Date.now()) {
        return fechaGuardada;
      }
      return redondearAlMinutoExacto(new Date(Date.now() + 60 * 1000));
    }

    const ahora = new Date();
    if (modoHora === 'ahora') {
      return redondearAlMinutoExacto(new Date(ahora.getTime() + 60 * 1000));
    }

    const partes = horaInicioTexto.trim().split(':');
    const horas = parseInt(partes[0], 10);
    const minutos = parseInt(partes[1], 10);

    if (
      isNaN(horas) ||
      isNaN(minutos) ||
      horas < 0 ||
      horas > 23 ||
      minutos < 0 ||
      minutos > 59
    ) {
      return null;
    }

    const fechaObjetivo = new Date();
    fechaObjetivo.setHours(horas, minutos, 0, 0);

    if (fechaObjetivo.getTime() <= ahora.getTime()) {
      fechaObjetivo.setDate(fechaObjetivo.getDate() + 1);
    }
    return fechaObjetivo;
  }

  async function handleGuardarMedicamento() {
    if (!nombre.trim()) {
      Alert.alert('Falta el nombre', 'Escribe el nombre del medicamento.');
      return;
    }

    const horasNum = parseFloat(cadaHoras);
    if (isNaN(horasNum) || horasNum <= 0) {
      Alert.alert('Intervalo inválido', 'Ingresa cada cuántas horas se toma (ej. 8).');
      return;
    }

    const stockNum = parseInt(cantidadTotal, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      Alert.alert('Cantidad inválida', 'Ingresa cuántas pastillas tienes disponibles.');
      return;
    }

    const medExistente = medicamentoEditandoId
      ? medicamentos.find((m) => m.id === medicamentoEditandoId)
      : null;

    const fechaPrimeraToma = calcularPrimeraToma(medExistente);
    if (!fechaPrimeraToma) {
      Alert.alert('Hora inválida', 'Usa el formato 24h HH:MM (por ejemplo, 08:30 o 21:15).');
      return;
    }

    if (medExistente?.notificationIds) {
      await cancelarNotificaciones(medExistente.notificationIds);
    }

    const proximaTomaISO = fechaPrimeraToma.toISOString();
    const nombreLimpio = nombre.trim();
    const dosisLimpia = dosis.trim() || '1 dosis';

    const notificationIds = await programarColaNotificaciones({
      nombre: nombreLimpio,
      dosis: dosisLimpia,
      proximaTomaISO,
      cadaHoras: horasNum,
    });

    let nuevaLista;
    if (medicamentoEditandoId) {
      nuevaLista = medicamentos.map((item) =>
        item.id === medicamentoEditandoId
          ? {
              ...item,
              nombre: nombreLimpio,
              dosis: dosisLimpia,
              cadaHoras: horasNum,
              restantes: stockNum,
              proximaTomaISO,
              nota: nota.trim(),
              notificationIds,
            }
          : item
      );
    } else {
      const nuevoMed = {
        id: Date.now().toString(),
        nombre: nombreLimpio,
        dosis: dosisLimpia,
        cadaHoras: horasNum,
        restantes: stockNum,
        proximaTomaISO,
        nota: nota.trim(),
        notificationIds,
      };
      nuevaLista = [nuevoMed, ...medicamentos];
    }

    setMedicamentos(nuevaLista);
    await guardarMedicamentos(nuevaLista);

    limpiarFormulario();
    setModalVisible(false);
  }

  async function handleMarcarTomada(med) {
    await cancelarNotificaciones(med.notificationIds);

    // Redondea el momento actual al minuto exacto (:00) y suma el intervalo en horas
    const baseExacta = redondearAlMinutoExacto(new Date());
    const siguienteFecha = new Date(baseExacta.getTime() + med.cadaHoras * 60 * 60 * 1000);
    siguienteFecha.setSeconds(0, 0);
    const proximaTomaISO = siguienteFecha.toISOString();

    const nuevosIds = await programarColaNotificaciones({
      nombre: med.nombre,
      dosis: med.dosis,
      proximaTomaISO,
      cadaHoras: med.cadaHoras,
    });

    const nuevoStock = med.restantes > 0 ? med.restantes - 1 : 0;

    const listaActualizada = medicamentos.map((item) =>
      item.id === med.id
        ? {
            ...item,
            restantes: nuevoStock,
            proximaTomaISO,
            notificationIds: nuevosIds,
          }
        : item
    );

    setMedicamentos(listaActualizada);
    await guardarMedicamentos(listaActualizada);

    const ahora = new Date();
    const registroHistorial = {
      id: Date.now().toString(),
      nombre: med.nombre,
      dosis: med.dosis,
      fechaTexto: ahora.toLocaleDateString('es-NI', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      horaTexto: ahora.toLocaleTimeString('es-NI', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    };

    const historialActualizado = await registrarTomaEnHistorial(registroHistorial);
    setHistorial(historialActualizado);

    if (nuevoStock <= 5 && nuevoStock > 0) {
      Alert.alert(
        '¡Quedan pocas pastillas!',
        `Solo te quedan ${nuevoStock} unidades de ${med.nombre}. Recuerda conseguir más pronto.`
      );
    } else if (nuevoStock === 0) {
      Alert.alert(
        'Inventario en 0',
        `Se terminaron las unidades registradas de ${med.nombre}.`
      );
    }
  }

  async function handleAjustarStock(med, delta) {
    const nuevoValor = Math.max(0, med.restantes + delta);
    const listaActualizada = medicamentos.map((item) =>
      item.id === med.id ? { ...item, restantes: nuevoValor } : item
    );
    setMedicamentos(listaActualizada);
    await guardarMedicamentos(listaActualizada);
  }

  function confirmarEliminar(med) {
    Alert.alert(
      'Eliminar medicamento',
      `¿Seguro que quieres quitar ${med.nombre} y cancelar sus alarmas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await cancelarNotificaciones(med.notificationIds);
            const filtrados = medicamentos.filter((item) => item.id !== med.id);
            setMedicamentos(filtrados);
            await guardarMedicamentos(filtrados);
          },
        },
      ]
    );
  }

  async function handleEliminarItemHistorial(id) {
    const actualizado = await eliminarRegistroHistorial(id);
    setHistorial(actualizado);
  }

  function confirmarLimpiarHistorial() {
    Alert.alert(
      'Vaciar historial',
      '¿Seguro que quieres borrar todos los registros de tomas anteriores?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar todo',
          style: 'destructive',
          onPress: async () => {
            const vacio = await limpiarTodoHistorial();
            setHistorial(vacio);
          },
        },
      ]
    );
  }

  async function probarNotificacionAhora() {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'CareRemind • Prueba de aviso 💙',
        body: '✨ ¡Todo listo! Así llegarán tus recordatorios amigables.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + 4000),
      },
    });
    Alert.alert('Prueba enviada', 'Bloquea tu pantalla o espera 4 segundos para verla llegar.');
  }

  function formatearProximaToma(isoString) {
    const fecha = new Date(isoString);
    const hoy = new Date();
    const manana = new Date();
    manana.setDate(hoy.getDate() + 1);

    const hora = fecha.toLocaleTimeString('es-NI', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (fecha.toDateString() === hoy.toDateString()) {
      return `Hoy a las ${hora}`;
    }
    if (fecha.toDateString() === manana.toDateString()) {
      return `Mañana a las ${hora}`;
    }

    const dia = fecha.toLocaleDateString('es-NI', {
      day: '2-digit',
      month: 'short',
    });
    return `${dia} a las ${hora}`;
  }

  const renderMedicamento = ({ item }) => {
    const stockBajo = item.restantes <= 5;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.medNombre}>{item.nombre}</Text>
            <Text style={styles.medDetalle}>
              {item.dosis} • Cada {item.cadaHoras} h
            </Text>
          </View>

          <View style={styles.cardAccionesTop}>
            <TouchableOpacity
              onPress={() => abrirModalEditar(item)}
              style={styles.btnEditar}
            >
              <Text style={styles.btnEditarTexto}>✎ Editar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => confirmarEliminar(item)}
              style={styles.btnEliminar}
            >
              <Text style={styles.btnEliminarTexto}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {item.nota ? <Text style={styles.medNota}>📝 {item.nota}</Text> : null}

        <View style={styles.infoRow}>
          <View style={styles.badgeProxima}>
            <Text style={styles.badgeProximaTexto}>
              ⏰ Próxima: {formatearProximaToma(item.proximaTomaISO)}
            </Text>
          </View>

          <View
            style={[
              styles.badgeStock,
              { backgroundColor: stockBajo ? '#FDECEC' : '#EAF4EC' },
            ]}
          >
            <Text
              style={[
                styles.badgeStockTexto,
                { color: stockBajo ? COLORS.danger : COLORS.primaryDark },
              ]}
            >
              💊 Quedan: {item.restantes}
            </Text>

            <TouchableOpacity
              onPress={() => handleAjustarStock(item, -1)}
              style={styles.btnStockMini}
            >
              <Text style={styles.btnStockMiniTexto}>-1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAjustarStock(item, 10)}
              style={styles.btnStockMini}
            >
              <Text style={styles.btnStockMiniTexto}>+10</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.btnTomada}
          onPress={() => handleMarcarTomada(item)}
        >
          <Text style={styles.btnTomadaTexto}>✓ Marcar como tomada</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHistorial = ({ item }) => (
    <View style={styles.historialCard}>
      <View style={styles.historialIcono}>
        <Text style={{ fontSize: 18 }}>✓</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.historialNombre}>{item.nombre}</Text>
        <Text style={styles.historialDosis}>{item.dosis}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
        <Text style={styles.historialHora}>{item.horaTexto}</Text>
        <Text style={styles.historialFecha}>{item.fechaTexto}</Text>
      </View>
      <TouchableOpacity
        onPress={() => handleEliminarItemHistorial(item.id)}
        style={styles.btnEliminarHistorial}
      >
        <Text style={styles.btnEliminarHistorialTexto}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Encabezado */}
      <View style={styles.header}>
        <View>
          <Text style={styles.tituloApp}>CareRemind</Text>
          <Text style={styles.subtituloApp}>Tu bienestar, siempre a tiempo</Text>
        </View>

        <TouchableOpacity style={styles.btnPrueba} onPress={probarNotificacionAhora}>
          <Text style={styles.btnPruebaTexto}>🔔 Probar</Text>
        </TouchableOpacity>
      </View>

      {/* Selector de Pestañas */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, pestanaActiva === 'pastillas' && styles.tabActiva]}
          onPress={() => setPestanaActiva('pastillas')}
        >
          <Text
            style={[
              styles.tabTexto,
              pestanaActiva === 'pastillas' && styles.tabTextoActiva,
            ]}
          >
            💊 Mis Pastillas ({medicamentos.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, pestanaActiva === 'historial' && styles.tabActiva]}
          onPress={() => setPestanaActiva('historial')}
        >
          <Text
            style={[
              styles.tabTexto,
              pestanaActiva === 'historial' && styles.tabTextoActiva,
            ]}
          >
            📋 Historial ({historial.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contenido Principal */}
      {pestanaActiva === 'pastillas' ? (
        <FlatList
          data={medicamentos}
          keyExtractor={(item) => item.id}
          renderItem={renderMedicamento}
          contentContainerStyle={styles.listaContenido}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>💙</Text>
              <Text style={styles.emptyTitulo}>Aún no tienes medicamentos</Text>
              <Text style={styles.emptySubtitulo}>
                Toca el botón "+ Agregar pastilla" para programar tu primer recordatorio.
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={historial}
          keyExtractor={(item) => item.id}
          renderItem={renderHistorial}
          contentContainerStyle={styles.listaContenido}
          ListHeaderComponent={
            historial.length > 0 ? (
              <View style={styles.historialHeaderRow}>
                <TouchableOpacity
                  onPress={confirmarLimpiarHistorial}
                  style={styles.btnVaciarHistorial}
                >
                  <Text style={styles.btnVaciarHistorialTexto}>🗑 Vaciar historial</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyTitulo}>Sin tomas registradas todavía</Text>
              <Text style={styles.emptySubtitulo}>
                Cada vez que marques una pastilla como tomada, aparecerá aquí con su fecha y hora exacta.
              </Text>
            </View>
          }
        />
      )}

      {/* Botón Flotante para Agregar */}
      {pestanaActiva === 'pastillas' && (
        <TouchableOpacity style={styles.fab} onPress={abrirModalCrear}>
          <Text style={styles.fabTexto}>+ Agregar pastilla</Text>
        </TouchableOpacity>
      )}

      {/* Modal de Crear / Editar Medicamento */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitulo}>
                {medicamentoEditandoId ? 'Editar Medicamento' : 'Nuevo Recordatorio'}
              </Text>

              <Text style={styles.label}>Nombre del medicamento *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Ibuprofeno, Vitamina D, Amoxicilina..."
                placeholderTextColor="#829AB1"
                value={nombre}
                onChangeText={setNombre}
              />

              <Text style={styles.label}>Dosis por toma</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. 1 tableta, 10 ml, 2 cápsulas"
                placeholderTextColor="#829AB1"
                value={dosis}
                onChangeText={setDosis}
              />

              <Text style={styles.label}>¿Cada cuántas horas se toma? *</Text>
              <View style={styles.chipsRow}>
                {INTERVALOS_RAPIDOS.map((horas) => (
                  <TouchableOpacity
                    key={horas}
                    style={[
                      styles.chip,
                      cadaHoras === horas && styles.chipActivo,
                    ]}
                    onPress={() => setCadaHoras(horas)}
                  >
                    <Text
                      style={[
                        styles.chipTexto,
                        cadaHoras === horas && styles.chipTextoActivo,
                      ]}
                    >
                      {horas}h
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="O escribe cualquier otro intervalo en horas (ej. 4, 16, 48)"
                placeholderTextColor="#829AB1"
                keyboardType="numeric"
                value={cadaHoras}
                onChangeText={setCadaHoras}
              />

              <Text style={styles.label}>
                {medicamentoEditandoId ? 'Horario de próxima toma' : '¿Cuándo es la primera toma?'}
              </Text>
              <View style={styles.chipsRow}>
                {medicamentoEditandoId && (
                  <TouchableOpacity
                    style={[styles.chipLargo, modoHora === 'mantener' && styles.chipActivo]}
                    onPress={() => setModoHora('mantener')}
                  >
                    <Text
                      style={[
                        styles.chipTexto,
                        modoHora === 'mantener' && styles.chipTextoActivo,
                      ]}
                    >
                      Mantener hora
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.chipLargo, modoHora === 'ahora' && styles.chipActivo]}
                  onPress={() => setModoHora('ahora')}
                >
                  <Text
                    style={[
                      styles.chipTexto,
                      modoHora === 'ahora' && styles.chipTextoActivo,
                    ]}
                  >
                    En 1 min
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chipLargo, modoHora === 'especifica' && styles.chipActivo]}
                  onPress={() => setModoHora('especifica')}
                >
                  <Text
                    style={[
                      styles.chipTexto,
                      modoHora === 'especifica' && styles.chipTextoActivo,
                    ]}
                  >
                    Elegir hora
                  </Text>
                </TouchableOpacity>
              </View>

              {modoHora === 'especifica' && (
                <TextInput
                  style={styles.input}
                  placeholder="Formato HH:MM (ej. 08:30 o 21:15)"
                  placeholderTextColor="#829AB1"
                  value={horaInicioTexto}
                  onChangeText={setHoraInicioTexto}
                  maxLength={5}
                />
              )}

              <Text style={styles.label}>¿Cuántas pastillas tienes en total?</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. 20"
                placeholderTextColor="#829AB1"
                keyboardType="numeric"
                value={cantidadTotal}
                onChangeText={setCantidadTotal}
              />

              <Text style={styles.label}>Nota opcional</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Tomar después de comer"
                placeholderTextColor="#829AB1"
                value={nota}
                onChangeText={setNota}
              />

              <View style={styles.modalBotones}>
                <TouchableOpacity
                  style={styles.btnCancelarModal}
                  onPress={() => {
                    limpiarFormulario();
                    setModalVisible(false);
                  }}
                >
                  <Text style={styles.btnCancelarModalTexto}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnGuardarModal}
                  onPress={handleGuardarMedicamento}
                >
                  <Text style={styles.btnGuardarModalTexto}>
                    {medicamentoEditandoId ? 'Actualizar' : 'Guardar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  tituloApp: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  subtituloApp: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  btnPrueba: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnPruebaTexto: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 10,
    backgroundColor: '#C5D3E0',
    borderRadius: 14,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 11,
  },
  tabActiva: {
    backgroundColor: COLORS.primaryDark,
  },
  tabTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  tabTextoActiva: {
    color: '#FFFFFF',
  },
  listaContenido: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#1E3A5F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardAccionesTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnEditar: {
    backgroundColor: '#EBF4FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  btnEditarTexto: {
    color: COLORS.primaryBright,
    fontSize: 12,
    fontWeight: '700',
  },
  medNombre: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  medDetalle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  medNota: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  btnEliminar: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  btnEliminarTexto: {
    color: '#829AB1',
    fontSize: 16,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  badgeProxima: {
    backgroundColor: '#EBF4FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeProximaTexto: {
    color: COLORS.primaryBright,
    fontWeight: '700',
    fontSize: 12,
  },
  badgeStock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeStockTexto: {
    fontWeight: '700',
    fontSize: 12,
  },
  btnStockMini: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnStockMiniTexto: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  btnTomada: {
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnTomadaTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  historialHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  btnVaciarHistorial: {
    backgroundColor: '#FDECEC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  btnVaciarHistorialTexto: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  historialCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historialIcono: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historialNombre: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  historialDosis: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  historialHora: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primaryBright,
  },
  historialFecha: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  btnEliminarHistorial: {
    padding: 6,
  },
  btnEliminarHistorialTexto: {
    color: '#829AB1',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 70,
    paddingHorizontal: 30,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: 10,
  },
  emptyTitulo: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primaryDark,
    textAlign: 'center',
  },
  emptySubtitulo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: COLORS.primaryBright,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#1E3A5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  fabTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 58, 95, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    maxHeight: '90%',
  },
  modalTitulo: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primaryDark,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F0F4F8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.primaryDark,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F0F4F8',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipLargo: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F0F4F8',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  chipActivo: {
    backgroundColor: COLORS.primaryBright,
    borderColor: COLORS.primaryBright,
  },
  chipTexto: {
    fontWeight: '700',
    color: COLORS.primaryDark,
    fontSize: 13,
  },
  chipTextoActivo: {
    color: '#FFFFFF',
  },
  modalBotones: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    marginBottom: 10,
  },
  btnCancelarModal: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  btnCancelarModalTexto: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 15,
  },
  btnGuardarModal: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primaryBright,
    alignItems: 'center',
  },
  btnGuardarModalTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});