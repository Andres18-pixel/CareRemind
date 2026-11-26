import AsyncStorage from '@react-native-async-storage/async-storage';

const MEDS_KEY = '@careremind_medicamentos';
const HISTORY_KEY = '@careremind_historial';

export async function obtenerMedicamentos() {
  const data = await AsyncStorage.getItem(MEDS_KEY);
  return data ? JSON.parse(data) : [];
}

export async function guardarMedicamentos(lista) {
  await AsyncStorage.setItem(MEDS_KEY, JSON.stringify(lista));
}

export async function obtenerHistorial() {
  const data = await AsyncStorage.getItem(HISTORY_KEY);
  return data ? JSON.parse(data) : [];
}

export async function registrarTomaEnHistorial(entrada) {
  const actual = await obtenerHistorial();
  const actualizado = [entrada, ...actual];
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(actualizado));
  return actualizado;
}

export async function eliminarRegistroHistorial(id) {
  const actual = await obtenerHistorial();
  const actualizado = actual.filter((item) => item.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(actualizado));
  return actualizado;
}

export async function limpiarTodoHistorial() {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
  return [];
}