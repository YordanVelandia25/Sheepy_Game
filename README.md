# Sheepy Jumps

Juego web para todas las edades: la oveja rebota sola de tablón en tablón y tú la mueves a izquierda y derecha para subir lo más alto posible, esquivando abejas y cardos.

Es una PWA (Progressive Web App): se puede jugar en el navegador o instalar como aplicación desde Chrome.

## Cómo se juega
- **Móvil:** toca el lado izquierdo o derecho de la pantalla.
- **Ordenador:** flechas ← → (o A / D). Enter o espacio para empezar.
- Tablones: café (normal), azul (se mueve), claro con grieta (se rompe).
- Cada choque con una abeja o un cardo quita un corazón. Si la oveja se cae, se acaba la partida.

## Ranking mundial (Supabase)
Las puntuaciones se guardan en el dispositivo y, si está configurado, también en un ranking mundial en Supabase.

1. En Supabase abre **SQL Editor → New query**, pega el contenido de `supabase/ranking.sql` y pulsa **Run** (vuelve a ejecutarlo cada vez que cambie ese archivo; es seguro repetirlo).
2. En **Project Settings → API Keys** copia la clave pública (*anon public* o *publishable*).
3. Pégala en `config.js`, en `supabaseKey`, y sube el cambio.

Reglas: **una sola puntuación por jugador** (por nombre, sin distinguir mayúsculas), que solo se reemplaza cuando se supera. Cualquiera puede **leer** el ranking y **enviar** puntuaciones (de 1 a 100000 m, nombres de hasta 16 caracteres), pero nadie puede borrar ni editar filas desde el juego. Para borrar puntuaciones falsas u ofensivas: **Table Editor → scores**.

Al perder aparece **Guardar puntuación**; si no se pulsa, la partida se guarda sola al pulsar **Jugar otra vez** o al cerrar el juego.

Si no hay conexión, la puntuación queda en cola y se envía al volver internet.

## Tipografías
- **Grandstander** (títulos, botones, números) y **Jost** (textos), de Google Fonts.
- Ambas con licencia SIL Open Font License: gratuitas también para uso comercial.

## Probar en local
```bash
python3 -m http.server 8080
```
Abre http://localhost:8080 en Chrome.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página del juego y botón de instalar |
| `game.js` | Lógica y dibujo del juego (los ajustes están al principio) |
| `config.js` | Dirección y clave pública de Supabase |
| `supabase/ranking.sql` | Tabla y reglas del ranking mundial |
| `sprites/` | Personaje (cuerpo y tenis por separado para animarlos) |
| `style.css` | Estilos |
| `manifest.json` | Nombre, iconos y colores de la app instalada |
| `sw.js` | Caché para jugar sin conexión |
| `icons/` | Iconos de la app |

**Al publicar cambios**, sube la versión en `index.html` (`?v=19` → `?v=20` en `style.css`, `config.js` y `game.js`) y la de la caché en `sw.js`, para que nadie mezcle archivos viejos y nuevos.
