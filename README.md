# Oveja Saltarina (Sheepy Game)

Juego web para todas las edades: la oveja rebota sola de tablón en tablón y tú la mueves a izquierda y derecha para subir lo más alto posible, esquivando abejas y cardos.

Es una PWA (Progressive Web App): se puede jugar en el navegador o instalar como aplicación desde Chrome.

## Cómo se juega
- **Móvil:** toca el lado izquierdo o derecho de la pantalla.
- **Ordenador:** flechas ← → (o A / D). Enter o espacio para empezar.
- Tablones: café (normal), azul (se mueve), claro con grieta (se rompe).
- Cada choque con una abeja o un cardo quita un corazón. Si la oveja se cae, se acaba la partida.

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
| `style.css` | Estilos |
| `manifest.json` | Nombre, iconos y colores de la app instalada |
| `sw.js` | Caché para jugar sin conexión |
| `icons/` | Iconos de la app |

**Al publicar cambios**, sube la versión de la caché en `sw.js` (`oveja-v1` → `oveja-v2`) para que quien tenga la app instalada reciba la actualización.
