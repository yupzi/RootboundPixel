// 地下分层地图：由 editor.html 编辑并写回（格式见 js/strata_gen.js）
G.STRATA = {
 "pit": {
  "layers": [
   {
    "name": "表土",
    "top": 0,
    "color": "#c99a62"
   },
   {
    "name": "砂岩",
    "top": 69,
    "color": "#9a6c4c"
   },
   {
    "name": "深岩",
    "top": 156,
    "color": "#6a4636"
   },
   {
    "name": "未勘探",
    "top": 255,
    "color": "#47302b"
   }
  ],
  "regions": [
   {
    "name": "表土",
    "x": 0,
    "y": 8,
    "w": 48,
    "h": 60,
    "seed": 821647,
    "items": [
     {
      "shape": "pool",
      "tile": "w",
      "n": 10,
      "min": 1,
      "max": 3
     },
     {
      "shape": "lens",
      "tile": "r",
      "n": 35,
      "min": 2,
      "max": 3
     },
     {
      "shape": "scatter",
      "tile": "o",
      "n": 4,
      "min": 1,
      "max": 1,
      "where": "nearRock"
     }
    ]
   },
   {
    "name": "浅岩",
    "x": 0,
    "y": 69,
    "w": 48,
    "h": 87,
    "seed": 321411,
    "items": []
   },
   {
    "name": "深岩",
    "x": 0,
    "y": 170,
    "w": 48,
    "h": 85,
    "seed": 9211,
    "items": [
     {
      "shape": "cave",
      "tile": "c",
      "n": 20,
      "min": 6,
      "max": 14
     },
     {
      "shape": "scatter",
      "tile": "k",
      "n": 4,
      "min": 1,
      "max": 1,
      "where": "caveFloor"
     },
     {
      "shape": "scatter",
      "tile": "a",
      "n": 3,
      "min": 1,
      "max": 1,
      "where": "caveFloor"
     },
     {
      "shape": "lens",
      "tile": "f",
      "n": 37,
      "min": 2.5,
      "max": 4.5
     },
     {
      "shape": "lens",
      "tile": "w",
      "n": 15,
      "min": 2.5,
      "max": 4.5
     },
     {
      "shape": "lens",
      "tile": "r",
      "n": 30,
      "min": 2.5,
      "max": 4.5
     },
     {
      "shape": "scatter",
      "tile": "o",
      "n": 8,
      "min": 1,
      "max": 1,
      "where": "nearRock"
     }
    ]
   },
   {
    "name": "深处",
    "x": 0,
    "y": 262,
    "w": 48,
    "h": 762,
    "seed": 4404,
    "items": [
     {
      "shape": "cave",
      "tile": "c",
      "n": 60,
      "min": 20,
      "max": 60
     },
     {
      "shape": "scatter",
      "tile": "k",
      "n": 30,
      "min": 1,
      "max": 1,
      "where": "caveFloor"
     },
     {
      "shape": "scatter",
      "tile": "a",
      "n": 20,
      "min": 1,
      "max": 1,
      "where": "caveFloor"
     },
     {
      "shape": "scatter",
      "tile": "g",
      "n": 20,
      "min": 1,
      "max": 1,
      "where": "caveFloor"
     },
     {
      "shape": "lens",
      "tile": "f",
      "n": 150,
      "min": 4,
      "max": 8
     },
     {
      "shape": "lens",
      "tile": "l",
      "n": 100,
      "min": 4,
      "max": 8
     },
     {
      "shape": "lens",
      "tile": "s",
      "n": 60,
      "min": 3,
      "max": 5
     },
     {
      "shape": "lens",
      "tile": "w",
      "n": 80,
      "min": 2.5,
      "max": 4.5
     },
     {
      "shape": "cluster",
      "tile": "r",
      "n": 500,
      "min": 2,
      "max": 6
     },
     {
      "shape": "scatter",
      "tile": "o",
      "n": 100,
      "min": 1,
      "max": 1,
      "where": "nearRock"
     }
    ]
   }
  ],
  "paint": "-2.11-37.13-35.13-356l-47l-9r2-45r3-35r4-10r3-7r4-17.3r-13r3-7r2or-17.3r-9.2r2-10r4-5l-11.4-10rorw2-17l3-10.3r2-8r3w2-18l2-.3l2-4.3r2-11.5-2l4-9l2-.3-l-6r2or-7w3.5-5l-8l4.3-l2-6r8-lw3.5-5l-8l-w-13r8-lw3-21w2-4r5-12l3-19r3-w-4r2or2-13l-2r5-22r5-16r5-22r5-28r5-20.w2l-15r3-ror3-20w3l-6rw2-6r3-r5-7l5-8wl3-6rw2-17l2-3l6-16r2-19lw2-5l-18r2-19.w2-5r2-18r-9r2-8.2w-3r4-28r2-8.4-ror2-2l2-19w2-4r2-8.4-r3-3lw2-2.r3-2l2r4-l2w3-4r3-18lw2-3r3-2l2ror2-l3w-4r4-17.5-7l2ror2-.2l-7r2-5r4-5.8-14.5-12r4-5.5-2r3-12l6-10.5-5.5-2r3-12l6-10.6-4.5-22l-3l5-34.r2-6l5-13.-20.ror3-6l2-13.-20.r7-19.-133w-13w3-43w5-18l-11l-12w3l2-17wl-11l2w-11wl3-15w3l-11l3-6r3-2l3-16.w2l-20r3-6.3-5o-.2-5w-30.3-7.2-5r3-28.12-5r4-28.7l3-8r2-34w3l.-23r3-7r2-7w4-.-11w-11r4-6r4-10.-24r3-20.-12w-11r3-24l2-4l2wl-38wl-4l4-37w2l-5l-39lwl-16o-14w-13l-3r3-4w-7o-13w3-16r3-3w2l2-18l2wl-16.r2-4wl2-19l3-8w2-13l3-19l3-12r50or6or20or14or16or9or15or18.8r5.5r7.4r6.33ror6.16r6.18r3or5.14r8.12c4.3r3l3r.15r3or2w5.6c5g.6l3c3.10or8w5.5c6r5.c.2c8.5l5r5lw4.5c6lrc15.4l21c5l.c9nc6.2l8.8l7ncac12a.c2.6l6.7c3.10c10.14l6.4c5.10c4ac3.16l4.5c6.10gc2.c.26c6.3l7.5c5l4r4.13c7.3l7c10gl4r4.7w2.2nc4na.3r3.2r2c11l3r3or.7w4.2gcac.3r3or3.2c10r7.10w2.10r7.2c5ncnr4oror2.5r8.3l2.7r.2c5.7r7.6ror6.l7.c12.8w4.9r4.c22.8w4.7c2.c25.10w2.8c17gcncr2.19l3.3c6gcn2c4gc2.r2.r5.3o.10l7.3c2.16l4r2.2r7.5l7.11l6.3l7.2r4or2.2l8r2.12l5.4l5.8c6l5r3.28c.c10lc4r.6w4.6l11.c14lc5.6w5.5l12c12alc8.5w3.4l8.5c9.6c8.r4.5l7w3.4c7l7.4c6.r5.10w4.r2.c6l9.4nc4.16w3r4c7.4l3.7n2cg.l3.19c6.20l6.12r3gc2gc.14r8l7.34r3o2r2.13r2.35o.7rl4r3.6r5.7c3.10r6.2l8r.w3.3r5o.5c5r.3w3r7c7lr2.2w3.5r2.7c6.3w3.rc3rc9.13l4.4c6.7c8ac2gc2.12l6.3c6.7c8gng.24c5.9r5.21l6.10l4w.15w3.8l8r2.6l5w3.2r2.3l5.w3.8l8r2.5l6w2r7.19l5r3.4l6.2w2.r2or3.3r7.21l4.4w2.10r7.25w3.19c6.16r3.w3.18c7.5w4.5r5.20c8g.5w5.3r4.2w3.4l3.10c6g.8w3.10w3.3l5.9nc5.44c2.6l3.7o.r7l3.13o.9l6.2r6.r6l5.3r2.2r8.4l5.4or10l9or15.2l6.6r3or2.3l6.4r3w3ror5.16r3or4.2l4.6r2w3r6.4r5c3.2c3r8.12w3r7.4c15r6.12w3l6r2.3c19.15w2l8.4gcnc4nc2.2c8.4c5.8l3cl3.18gc5.3c8.8c3.21c4.3c9.2c3.3c5.17l5.4c2.2c4.3c11.9w4.3l9.14c5nc6r.5w4.7l5.17c.2c7r2.5w2.6l11.7l.7cnc5.8w3.4l13.5l10c3.10w3.6l3.5l8.l12.3or4.23l2.8l7.3r5.12c9.9r7.16c14gcr3.4w3r2or2o.8l5.c16n2r5.w4.2r3.8l7c10g2c4r6.3w2.12l6.3c5acr16.6c6.24r6oror3.2c.c10.25r7.3c13.9w3.23c12.2w4r4w3.13w3.14c5.2w4r2or3.14w3.23r3or4.4l4.17w3.14r4.4l8.10w4.w3.22l8.10w4f5-4f6.9f12-4f16-3f10-2f14-3f17-3f10r2-f12-5f15-3f10-3f12-3f-f16-3f11-f16-rf14-4f11-f16-f15-4f11-f16rf16-2f12-f14-2rf16-.-2f10-f14-3f16-4f10-f14-rf16-4f9-3f13-rf17-3.f9-3f11-3f20.f10-2f12-2f9-f9-3f9-3f12-2f3-263.20-28.20-28.20-28.20-1518w3-46w2-529w2-35f-10w2-48.-47.4-157w2-318w4-476.4-304.-42.6-92.6f336-36480b96"
 }
};
