# Solmar Bay

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/ice-makefun/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/ice-makefun/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

Open-world crime game 3D di kota pesisir fiktif **Solmar Bay** — matahari terbenam,
jalanan ramai, dan polisi yang tidak pernah tidur. Dibangun dengan three.js,
berjalan offline dari file statis di desktop Chrome.

## Cerita

Rico Marin, sopir pelarian terbaik di Solmar Bay, baru keluar dari penjara dan
berutang pada semua orang. Tiga pekerjaan menantinya:

1. **First Wheels** — curi Comet oranye di Bayfront Ave, antar ke Solmar Garage.
2. **Bayfront Heat** — kabur dari kejaran polisi ke hideout Coral Street dalam 90 detik.
3. **The Solmar Job** — ambil paket di Old Pier dari geng rival Vultures yang menembak
   balik, lalu antar ke drop point.

Di luar misi: 12 cash pickup tersebar di kota, mobil apa pun bisa dicuri, dan
wanted level 0–5 menentukan seberapa keras polisi mengejarmu.

## Cara main

- **WASD** — jalan / mengemudi · **Mouse** — kamera & bidik (klik canvas untuk kunci mouse)
- **E** — masuk / keluar mobil · **Klik kiri** — tembak · **R** — isi ulang
- **Space** — rem · **Ctrl** — handbrake · **Shift** — lari
- **Esc / P** — pause & simpan · **M** — mute

Progres (uang, misi, posisi) tersimpan otomatis ke localStorage — tombol
**Continue** di menu utama memuatnya kembali.

## Sistem

Kota grid 7×7 dengan gedung low-poly berlampu, taman palem, pantai dan laut;
traffic yang belok di persimpangan dan mengerem di belakang mobil lain;
pejalan kaki yang panik saat mobil ngebut; mobil polisi yang mengejar dan
menabrak; polisi jalan kaki yang bisa menangkapmu (bust); combat pistol hitscan
dengan headshot bonus; HUD lengkap dengan minimap top-down; suara sintetis
WebAudio (mesin, tembakan, sirene, jingle misi); efek muzzle flash, spark
tabrakan, dan lampu rem.

## Jalankan

```sh
node serve.ts   # lalu buka http://localhost:8080
```

Screenshot deterministik: `?shot=start|drive|chase|mission&seed=N`.

## Lisensi

MIT — lihat LICENSE.
