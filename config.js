// Configuración del ranking mundial (Supabase).
// La "anon public key" está pensada para ir en webs públicas: solo permite lo que
// dejan las reglas definidas en supabase/ranking.sql (leer el ranking y enviar puntuaciones).
// Si supabaseKey está vacía, el juego usa solo el ranking de este dispositivo.
window.OVEJA_CONFIG = {
  supabaseUrl: 'https://lwqowufumncicnshmfbc.supabase.co',
  supabaseKey: '',
};
