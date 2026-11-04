# Unified Panel

**Español** · [English](README.en.md)

Un centro de control unificado para GNOME Shell que combina el **Centro de
control de macOS** y el **centro de notificaciones de Windows 11** en un
único panel:

| Columna de notificaciones (estilo Windows) | Columna de controles (estilo macOS) |
|--------------------------------------------|-------------------------------------|
| Lista de notificaciones con «Limpiar»      | Reloj grande y fecha                |
| Calendario, eventos y relojes mundiales    | Tarjeta «Reproduciendo» (MPRIS)     |
| Tiempo                                     | Ajustes rápidos de GNOME (Wi‑Fi, Bluetooth, sonido, brillo, energía…) |

Tanto el reloj como los iconos de sistema de la barra superior abren el
mismo panel. También incluye un formato personalizable para el reloj de la
barra, inspirado en la idea de *Date Menu Formatter*.

Compatible con **GNOME Shell 51**. Funciona con Dash to Panel.

## Opciones

Se abren con `./build.sh prefs` o desde la aplicación Extensiones.

**Panel**
- Integrar las notificaciones en el panel (sí/no)
- Integrar el calendario, los eventos, los relojes mundiales y el tiempo (sí/no).
  Si alguno de los dos está desactivado, el reloj mantiene su propio menú
  con lo que quede.
- Tarjeta «Reproduciendo» (sí/no). Si se desactiva, los reproductores siguen
  en la lista de notificaciones.
- Reloj grande (sí/no) y el formato de su fecha
- Lado de la columna: notificaciones a la izquierda o a la derecha
- Ocultar el punto de notificaciones sin leer junto al reloj

**Reloj**
- Formato personalizado del reloj de la barra con códigos de GLib
  (`%a %-d %b  %H:%M`), `\n` para dos líneas, vista previa en directo y
  tamaño de letra

## Instalación

Requiere **GNOME Shell 51**. Comprueba tu versión con `gnome-shell --version`.

### Opción 1: desde extensions.gnome.org

Cuando esté aprobada, se podrá instalar con un clic desde
[extensions.gnome.org](https://extensions.gnome.org) o desde la aplicación
**Gestor de extensiones**, buscando «Unified Panel».

### Opción 2: desde una versión publicada

1. Descarga `unified-panel@aleixenandros.me.shell-extension.zip` de la
   [última versión](https://github.com/Aleixenandros/unified-panel/releases/latest).
2. Instálala y actívala:

   ```sh
   gnome-extensions install --force unified-panel@aleixenandros.me.shell-extension.zip
   gnome-extensions enable unified-panel@aleixenandros.me
   ```

3. Cierra sesión y vuelve a entrar.

### Opción 3: desde el código

No hace falta compilar código ni instalar Node.js: el script `build.sh`
empaqueta e instala la extensión con las herramientas estándar de GNOME.

```sh
git clone https://github.com/Aleixenandros/unified-panel.git
cd unified-panel
./build.sh
```

Sin argumentos muestra un menú con las opciones más comunes. También se
puede usar directamente:

| Comando                  | Qué hace                                              |
|--------------------------|-------------------------------------------------------|
| `./build.sh install -e`  | Compila, instala y activa la extensión                |
| `./build.sh install`     | Compila e instala                                     |
| `./build.sh build`       | Solo compila el `.zip` en `build/`                    |
| `./build.sh status`      | Versión, compatibilidad con tu GNOME y estado         |
| `./build.sh prefs`       | Abre las preferencias                                 |
| `./build.sh uninstall`   | Desinstala                                            |
| `./build.sh help`        | Todos los comandos                                    |

Si falta alguna herramienta, el script te dice el comando exacto para
instalarla en Fedora, Debian/Ubuntu, Arch u openSUSE.

Al terminar, cierra sesión y vuelve a entrar para cargar la versión nueva
(en Wayland es necesario).

Para actualizar más adelante:

```sh
git pull
./build.sh install
```

Si prefieres `make`, existen los mismos atajos (`make install`, `make pack`…).

### Desinstalar

```sh
gnome-extensions uninstall unified-panel@aleixenandros.me
```

o `./build.sh uninstall` si la instalaste desde el código.

## Publicar una versión

Desde `main`, sin cambios pendientes:

```sh
make release VERSION=2.1
```

Esto cambia `version-name` en `metadata.json`, comprueba que el paquete se
genera bien, hace el commit, crea la etiqueta `v2.1` y la sube. Al recibir
la etiqueta, GitHub Actions (`.github/workflows/release.yml`) genera el
`.zip` y crea la *Release* en GitHub con las notas de los cambios.

Después, descarga el `.zip` de la Release y súbelo a mano en
<https://extensions.gnome.org/upload/>, que no permite subidas
automáticas. El número `version` lo asigna extensions.gnome.org; nosotros
solo controlamos `version-name`.

El `.zip` nunca se guarda en git: `build/` está en `.gitignore`.

## Estructura del proyecto

```
extension.js          punto de entrada: enable/disable, se reconstruye al cambiar opciones
prefs.js              ventana de preferencias (libadwaita)
lib/unifiedPanel.js   mueve los widgets de GNOME al panel de ajustes rápidos
lib/mediaCard.js      tarjeta «Reproduciendo»
lib/clockHeader.js    reloj grande y fecha
lib/clockFormatter.js reloj personalizado de la barra
lib/format.js         utilidades de fecha compartidas con prefs.js
schemas/              esquema GSettings (todas las opciones)
po/                   traducciones (es)
stylesheet.css        estilos, compatibles con tema claro y oscuro
build.sh              compilar, instalar, traducir (lo usa también el Makefile)
.github/workflows/    publicación automática de versiones
```

## Cómo funciona (para colaboradores)

La extensión no reimplementa los widgets de GNOME: **mueve** la lista de
notificaciones, la columna del calendario y la cuadrícula de ajustes
rápidos originales a una nueva disposición de dos columnas, y los devuelve a
su sitio al desactivarse. Así la Wi‑Fi, el Bluetooth, el sonido, las
notificaciones, etc. se comportan exactamente como en GNOME y el código se
mantiene pequeño.

Depende de algunos campos privados de GNOME Shell, todos usados en
`lib/unifiedPanel.js`. Cuando salga una nueva versión de GNOME, revisa
estos primero:

- `Main.panel.statusArea.quickSettings.menu`: `_grid`, `_overlay`, `_boxPointer`
- `Main.panel.statusArea.dateMenu`: `_messageList`, `_calendar`, `_date`,
  `_eventsItem`, `_indicator`, `_clockDisplay`, `_clock`
- `_messageList._messageView`: `_mediaSource`, `_playerToMessage`,
  `_removePlayer()`, `_setupMpris()`

Pautas:
- JavaScript moderno sin compilar (módulos ES), siguiendo el estilo de código
  de GNOME Shell.
- Todo lo que se cambia en `enable()` debe deshacerse en `disable()`.
- Los textos visibles pasan por `_()`; ejecuta `./build.sh pot` después de cambiarlos.

## Licencia

GPL-2.0-or-later
