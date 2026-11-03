# Unified Panel - build helpers. Only standard GNOME tools are needed:
# gnome-extensions, glib-compile-schemas, xgettext and msgfmt.

UUID   := unified-panel@aleixenandros.me
SCHEMA := schemas/org.gnome.shell.extensions.unified-panel.gschema.xml
ZIP    := build/$(UUID).shell-extension.zip
JS     := extension.js prefs.js $(wildcard lib/*.js)

.PHONY: all pack install uninstall enable disable prefs pot check clean

all: pack

pack: $(ZIP)

$(ZIP): metadata.json stylesheet.css $(JS) $(SCHEMA) $(wildcard po/*.po)
	@mkdir -p build
	gnome-extensions pack --force --out-dir=build \
		--extra-source=lib --schema=$(SCHEMA) --podir=po .

install: pack
	gnome-extensions install --force $(ZIP)
	glib-compile-schemas $(HOME)/.local/share/gnome-shell/extensions/$(UUID)/schemas
	@echo "Installed. On Wayland, log out and back in to load the new code."

uninstall:
	gnome-extensions uninstall $(UUID)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

# Regenerate the translation template after changing user-visible strings.
pot:
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=N_ \
		--add-comments=Translators --package-name="$(UUID)" \
		--output=po/unified-panel.pot $(JS)
	@for po in $(wildcard po/*.po); do msgmerge --update --backup=none "$$po" po/unified-panel.pot; done

# Validate the settings schema.
check:
	glib-compile-schemas --strict --dry-run schemas
	@echo "OK"

clean:
	rm -rf build
