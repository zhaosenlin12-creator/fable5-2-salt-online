      (() => {
        const SETTINGS_KEY = "saltline.settings.v1";
        const localeText = (source) => {
          try {
            const data = window.__SALT_I18N__;
            const map = data && data.messages && data.messages.gameText;
            return (map && map[source]) || source;
          } catch {
            return source;
          }
        };
        // 按点号路径查语言包，取不到时回落到 key 本身。
        const t = (key) => {
          try {
            const messages = (window.__SALT_I18N__ || {}).messages || {};
            const value = String(key || "").split(".").reduce((acc, part) => (
              acc && typeof acc === "object" ? acc[part] : undefined
            ), messages);
            return typeof value === "string" ? value : key;
          } catch {
            return key;
          }
        };
        const readInfinite = () => {
          try {
            const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
            return !!(data && data.infiniteAmmo);
          } catch {
            return false;
          }
        };
        const readGod = () => {
          try {
            const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
            return !!(data && data.godMode);
          } catch {
            return false;
          }
        };

        let infiniteAmmo = readInfinite();
        let godMode = readGod();
        const nativeSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === SETTINGS_KEY) {
            try {
              const data = JSON.parse(String(value));
              if (data && typeof data === "object") {
                data.infiniteAmmo = infiniteAmmo;
                value = JSON.stringify(data);
              }
            } catch {}
          }
          return nativeSetItem.call(this, key, value);
        };

        function persist() {
          try {
            const current = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
            current.infiniteAmmo = infiniteAmmo;
            current.godMode = godMode;
            nativeSetItem.call(localStorage, SETTINGS_KEY, JSON.stringify(current));
          } catch {}
        }

        window.SaltAmmo = {
          get infinite() { return infiniteAmmo; }
        };
        // 中文魔改：无敌开关，服务端 SALT_MOD=1 时才会真正生效。
        window.SaltGodMode = {
          get enabled() { return godMode; }
        };

        function syncWeapon() {
          const weapon = window.__G?.weapon;
          if (weapon) weapon.infiniteAmmo = infiniteAmmo;
        }

        function sendSetting() {
          window.__mp?.send({ type: "ammoMode", infinite: infiniteAmmo });
        }

        function sendGod() {
          window.__mp?.send({ type: "godMode", enabled: godMode });
        }

        function updateToggle() {
          const button = document.querySelector('[data-act="infiniteAmmo"]');
          if (!button) return;
          button.setAttribute("aria-pressed", String(infiniteAmmo));
          const state = button.querySelector("span");
          if (state) state.textContent = localeText(infiniteAmmo ? "开" : "关");
        }

        function updateHud() {
          const ammo = document.querySelector(".h-ammo");
          if (ammo) ammo.classList.toggle("infinite", infiniteAmmo);
        }

        // 无敌开关只在服务端开放魔改时才显示。
        function modsAllowed() {
          return window.__saltMods?.god === true;
        }

        function updateGodToggle() {
          const button = document.querySelector('[data-act="godMode"]');
          if (!button) return;
          button.setAttribute("aria-pressed", String(godMode));
          const state = button.querySelector("span");
          if (state) state.textContent = t(godMode ? "godMode.on" : "godMode.off");
        }

        function syncAll() {
          syncWeapon();
          updateToggle();
          updateHud();
          updateGodToggle();
        }

        function setInfinite(next) {
          infiniteAmmo = !!next;
          persist();
          syncAll();
          sendSetting();
        }

        function ensureSettingRow() {
          const pane = document.querySelector('.panel-b[data-pane="settings"]');
          if (!pane || pane.querySelector('[data-act="infiniteAmmo"]')) return;

          const row = document.createElement("div");
          row.className = "row";
          row.innerHTML = '<label id="l-inf">' + localeText("无限子弹") + '</label><button class="toggle" data-act="infiniteAmmo" aria-labelledby="l-inf" aria-pressed="false" title="' + localeText("开启后无需换弹") + '"><i></i><span>' + localeText("关") + '</span></button>';
          const invert = pane.querySelector('[data-act="invert"]');
          const invertRow = invert && invert.closest(".row");
          if (invertRow && invertRow.parentNode === pane) invertRow.after(row);
          else pane.insertBefore(row, pane.firstChild);
        }

        function ensureGodRow() {
          const pane = document.querySelector('.panel-b[data-pane="settings"]');
          if (!pane || !modsAllowed()) return;
          if (pane.querySelector('[data-act="godMode"]')) return;
          const row = document.createElement("div");
          row.className = "row";
          row.innerHTML = '<label id="l-god">' + t("godMode.toggle") + '</label><button class="toggle" data-act="godMode" aria-labelledby="l-god" aria-pressed="false" title="' + t("godMode.hint") + '"><i></i><span>' + t("godMode.off") + '</span></button>';
          const infinite = pane.querySelector('[data-act="infiniteAmmo"]');
          const infiniteRow = infinite && infinite.closest(".row");
          if (infiniteRow && infiniteRow.parentNode === pane) infiniteRow.after(row);
          else pane.insertBefore(row, pane.firstChild);
        }

        function refresh() {
          ensureSettingRow();
          ensureGodRow();
          syncAll();
        }

        window.addEventListener("storage", (event) => {
          if (event.key !== SETTINGS_KEY) return;
          infiniteAmmo = readInfinite();
          syncAll();
          sendSetting();
        });
        document.addEventListener("click", (event) => {
          const button = event.target && event.target.closest && event.target.closest('[data-act="infiniteAmmo"]');
          if (button) {
            event.preventDefault();
            setInfinite(!infiniteAmmo);
            return;
          }
          const godButton = event.target && event.target.closest && event.target.closest('[data-act="godMode"]');
          if (!godButton || !modsAllowed()) return;
          event.preventDefault();
          godMode = !godMode;
          persist();
          syncAll();
          sendGod();
        }, true);
        window.addEventListener("pageshow", refresh);
        document.addEventListener("DOMContentLoaded", refresh);
        refresh();
        setInterval(refresh, 250);
      })();
