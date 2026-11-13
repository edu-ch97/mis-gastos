# Mis Gastos (PWA)

App personal para registrar tus gastos mes a mes. Funciona sin internet y los datos se guardan **solo en tu iPhone**.

## Funciones
- Registro de gastos en **soles o dólares**, con un tipo de cambio que tú configuras. Los totales se muestran en tu moneda principal.
- 16 categorías listas para usar. Puedes **crear, editar y eliminar** categorías (nombre, emoji, color) desde la pestaña Categorías o con “＋ Nueva” dentro del formulario.
- **Presupuesto mensual** total y por categoría, con barras que cambian de color y el monto que puedes gastar por día.
- Resumen del mes: total, variación frente al mes anterior, gráfico por categoría, desglose por método de pago (efectivo, débito, crédito, Yape/Plin, transferencia) y comparación de los últimos 6 meses.
- **Gastos fijos** 🔁 (alquiler, internet, Netflix…). Se registran solos cada mes y puedes pausarlos.
- Movimientos agrupados por día, con búsqueda y filtro por categoría. Toca uno para editarlo o eliminarlo.
- Exportar a **CSV** (se abre en Excel o Numbers), **respaldo y restauración en JSON** y recordatorio de respaldo.
- Desliza a los lados para cambiar de mes. Tiene modo oscuro automático.

## Publicarla gratis en GitHub Pages
1. Crea un repositorio en GitHub, por ejemplo `mis-gastos`.
2. Sube **todos** los archivos de esta carpeta, con la carpeta `icons/`, a la raíz del repositorio.
3. Ve a **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** y presiona Save.
4. En 1–2 minutos estará en `https://TU-USUARIO.github.io/mis-gastos/`.

> El código es público, pero tus gastos nunca salen del teléfono.

## Instalarla en el iPhone
1. Abre la URL en **Safari**.
2. Toca **Compartir → Añadir a pantalla de inicio**.
3. Usa siempre el **ícono instalado**: sus datos son independientes de los de Safari.

## Actualizar la app
Edita los archivos, cambia `CACHE = 'mis-gastos-v1'` a `v2` en `sw.js` y súbelos. La app toma la versión nueva al abrirla una o dos veces.

## Respaldo
Si borras la app de la pantalla de inicio, sus datos se borran también. Haz un respaldo de vez en cuando (Ajustes → Crear respaldo) y guárdalo en Archivos o iCloud Drive.

## Probar en la computadora
```bash
python3 -m http.server 8000
# abre http://localhost:8000
```
