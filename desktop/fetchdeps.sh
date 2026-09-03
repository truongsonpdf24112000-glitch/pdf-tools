#!/bin/bash
# Trích các thư viện .so mà Electron cần từ deb repo (không cần root)
# Vào /opt/data/elextra/root — sau đó chạy Electron với LD_LIBRARY_PATH trỏ vào đây
set -u
BASE=/opt/data/elextra
EL=/opt/data/pdf-tools/desktop/node_modules/electron/dist/electron
mkdir -p $BASE && cd $BASE

# Map lib -> package name (Debian 13 t64 transition)
declare -A MAP=(
  [libXinerama.so.1]=libxinerama1t64
  [libcloudproviders.so.0]=libcloudproviders0
  [libepoxy.so.0]=libepoxy0
  [libatk-1.0.so.0]=libatk1.0-0t64
  [libatk-bridge-2.0.so.0]=libatk-bridge2.0-0t64
  [libatspi.so.0]=libatspi2.0-0t64
  [libcairo.so.2]=libcairo2
  [libpango-1.0.so.0]=libpango-1.0-0
  [libpangocairo-1.0.so.0]=libpango-1.0-0
  [libpangoft2-1.0.so.0]=libpango-1.0-0
  [libgdk_pixbuf-2.0.so.0]=libgdk-pixbuf-2.0-0
  [libharfbuzz.so.0]=libharfbuzz0b
  [libcairo-gobject.so.2]=libcairo-gobject2
  [libxkbcommon.so.0]=libxkbcommon0
  [libgbm.so.1]=libgbm1
  [libasound.so.2]=libasound2t64
  [libdrm.so.2]=libdrm2
  [libXcomposite.so.1]=libxcomposite1
  [libXdamage.so.1]=libxdamage1
  [libXfixes.so.3]=libxfixes3
  [libXrandr.so.2]=libxrandr2
  [libxcb.so.1]=libxcb1
  [libX11.so.6]=libx11-6
  [libXext.so.6]=libxext6
  [libglib-2.0.so.0]=libglib2.0-0t64
  [libgobject-2.0.so.0]=libglib2.0-0t64
  [libgio-2.0.so.0]=libglib2.0-0t64
  [libgmodule-2.0.so.0]=libglib2.0-0t64
  [libgthread-2.0.so.0]=libglib2.0-0t64
  [libfreetype.so.6]=libfreetype6
  [libfontconfig.so.1]=libfontconfig1
  [libpng16.so.16]=libpng16-16t64
  [libpixman-1.so.0]=libpixman-1-0
  [libxcb-render.so.0]=libxcb-render0
  [libxcb-shm.so.0]=libxcb-shm0
  [libXrender.so.1]=libxrender1
  [libgraphene-1.0.so.0]=libgraphene-1.0-0
  [libgio-2.0.so.0]=libglib2.0-0t64
  [liblz4.so.1]=liblz4-1
  [libzstd.so.1]=libzstd1
  [libudev.so.1]=libudev1
  [libcups.so.2]=libcups2t64
  [libsecret-1.so.0]=libsecret-1-0
  [libwayland-client.so.0]=libwayland-client0
  [libwayland-cursor.so.0]=libwayland-cursor0
  [libwayland-egl.so.1]=libwayland-egl1
  [libX11-xcb.so.1]=libx11-xcb1
  [libsm.so.6]=libsm6
  [libice.so.6]=libice6
  [libthai.so.0]=libthai0
  [libdatrie.so.1]=libdatrie1
  [libfribidi.so.0]=libfribidi0
  [libbsd.so.0]=libbsd0
  [libmd.so.0]=libmd0
  [libbrotlidec.so.1]=libbrotli1
  [libbrotlicommon.so.1]=libbrotli1
  [libevent-2.1.so.7]=libevent-2.1-7t64
  [libxkbcommon-x11.so.0]=libxkbcommon-x11-0
  [libcairo-script-interpreter.so.2]=libcairo2
)

for round in $(seq 1 30); do
  LIBPATH=$(find $BASE/root -name "*.so*" 2>/dev/null | xargs -n1 dirname 2>/dev/null | sort -u | tr '\n' ':')
  miss=$(LD_LIBRARY_PATH=$LIBPATH ldd $EL $BASE/root/usr/lib/x86_64-linux-gnu/libgtk-3.so.0 2>/dev/null | grep "not found" | awk '{print $1}' | sort -u)
  if [ -z "$miss" ]; then echo "=== ALL DEPS OK after $((round-1)) rounds ==="; exit 0; fi
  progress=0
  for lib in $miss; do
    pkg=${MAP[$lib]:-}
    if [ -z "$pkg" ]; then echo "UNKNOWN: $lib"; continue; fi
    if [ ! -f ${pkg}_*.deb ]; then
      apt-get download "$pkg" >/dev/null 2>&1 || { echo "DL FAIL: $pkg ($lib)"; continue; }
    fi
    dpkg-deb -x ${pkg}_*.deb root 2>/dev/null && { progress=1; echo "got $pkg (for $lib)"; }
  done
  [ $progress -eq 0 ] && { echo "=== STUCK remaining: ==="; echo "$miss"; exit 1; }
done
echo "=== TOO MANY ROUNDS ==="; exit 1
