# Material / Labor classification — needs your review

Auto-classified 527 active products today (2026-05-26) so invoices can show a real Materials / Labor breakdown instead of a 70/30 estimate.

Distribution: **264 material · 252 labor · 11 NULL (bundles & incentives — components decide)**

## How the renderer uses this

When an invoice line item is a bundle, we walk its components (`product_components` table) and sum the labeled costs:
- Sum of `material`-labeled component costs → parts portion
- Sum of `labor`-labeled component costs → labor portion
- The ratio is applied to the line's selling price (covers the margin proportionally)
- If ANY component is unclassified for a line, that line falls back to 70/30

## Action items for London

Go to **Products & Services** in the admin nav. Each product card has a new Material/Labor toggle. The categories below need your attention in priority order:

### Possibly mis-classified (currently 'material', may actually be 'labor') — 0 products

_None flagged — heuristic looks clean for this run._

### Tagged 'labor' (252 products) — quick scan to confirm

| ID | Type | Name | Reason |
|---|---|---|---|
| 1068 | Window Cleaning | Window Well Cleaning | type='Window Cleaning' is labor-only |
| 1074 | Window Cleaning | Window Screen Repair/Replacement | type='Window Cleaning' is labor-only |
| 1089 | Exterior Cleaning & Maint | Roof cleaning per Sq/Ft | type='Exterior Cleaning & Maint' is labor-only |
| 1087 | Window Cleaning | Soft Wash -Pressure Washing Sq/Ft | type='Window Cleaning' is labor-only |
| 1066 | Window Cleaning | Post Construction Window Cleaning (More than 6ft wide/high | type='Window Cleaning' is labor-only |
| 1064 | Window Cleaning | Residential Interior Windows | type='Window Cleaning' is labor-only |
| 1065 | Window Cleaning | Residential Exterior Windows | type='Window Cleaning' is labor-only |
| 1082 | Window Cleaning | Post Construction Window Cleaning (More than 4ft wide/high) | type='Window Cleaning' is labor-only |
| 1093 | Window Cleaning | Residential Exterior Windows (Subscription) | type='Window Cleaning' is labor-only |
| 1085 | Window Cleaning | Stone Cleaning Sq/Ft | type='Window Cleaning' is labor-only |
| 1070 | Window Cleaning | Store Front/Commercial Exterior Window Cleaning | type='Window Cleaning' is labor-only |
| 1073 | Window Cleaning | Shower Glass Restoration | type='Window Cleaning' is labor-only |
| 1078 | Window Cleaning | Commercial Hard Water Removal | type='Window Cleaning' is labor-only |
| 1953 | Window Cleaning | Residential Window Cleaning - Interior & Exterior Windows | type='Window Cleaning' is labor-only |
| 1075 | Commercial Window Cleaning | Commercial Hard to access Lift Windows | type='Commercial Window Cleaning' is labor-only |
| 1077 | Window Cleaning | Commercial Interior Window Cleaning | type='Window Cleaning' is labor-only |
| 1091 | Window Cleaning | Window Well Cleaning (Subscription) | type='Window Cleaning' is labor-only |
| 1069 | Window Cleaning | Window Scree Cleaning/Sterilizing | type='Window Cleaning' is labor-only |
| 1083 | Window Cleaning | Screen Cleaning | type='Window Cleaning' is labor-only |
| 1092 | Window Cleaning | Residential Interior Windows (Subscription) | type='Window Cleaning' is labor-only |
| 1086 | Window Cleaning | Power wash  Sq/Ft | type='Window Cleaning' is labor-only |
| 1081 | Window Cleaning | Post Construction Window Cleaning (Less than 4ft wide/high) | type='Window Cleaning' is labor-only |
| 1076 | Window Cleaning | Partition Glass | type='Window Cleaning' is labor-only |
| 1072 | Window Cleaning | MIRROR CLEANING | type='Window Cleaning' is labor-only |
| 1094 | Window Cleaning | MIRROR CLEANING (Subscription) | type='Window Cleaning' is labor-only |
| 1084 | Residential Window Cleaning | Clean All Exterior Windows and Screens,  and Tracks | type='Residential Window Cleaning' is labor-only |
| 1102 | Window Cleaning | Commercial Hard Water Removal (Subscription) | type='Window Cleaning' is labor-only |
| 1124 | LABOR Energy Scout | Labor - Energy Scout | type='LABOR Energy Scout' is labor-only |
| 1126 | LABOR Energy Scout | Labor Lift -Energy Scout | type='LABOR Energy Scout' is labor-only |
| 1098 | Commercial Window Cleaning | Commercial Exterior 2nd story Window Cleaning | type='Commercial Window Cleaning' is labor-only |
| 1121 | Window Cleaning | Commercial Windows (LIFT Up To 10 Floors) | type='Window Cleaning' is labor-only |
| 1123 | Window Cleaning | Commercial Windows (LIFT Up To 10 Floors) (SUBSCRIPTION) | type='Window Cleaning' is labor-only |
| 1120 | Window Cleaning | Commercial Windows Exterior (LIFT Up To 7Floors) | type='Window Cleaning' is labor-only |
| 1122 | Window Cleaning | Commercial Windows Exterior (LIFT Up To 7Floors) (SUBSCRIPTION) | type='Window Cleaning' is labor-only |
| 1110 | Window Cleaning | Stone Cleaning Sq/Ft (Subscription) | type='Window Cleaning' is labor-only |
| 1096 | Window Cleaning | Screen Cleaning (Subscription) | type='Window Cleaning' is labor-only |
| 1097 | Window Cleaning | Front/Commercial Exterior Window Cleaning (Subscription) | type='Window Cleaning' is labor-only |
| 1104 | Window Cleaning | Residential Hard Water Removal | type='Window Cleaning' is labor-only |
| 1119 | Window Cleaning | Power wash -PARKING | type='Window Cleaning' is labor-only |
| 1106 | Window Cleaning | Power wash  Sq/Ft (Subscription) | type='Window Cleaning' is labor-only |
| 1100 | Window Cleaning | Partition Glass (Subscription) | type='Window Cleaning' is labor-only |
| 1108 | Exterior Cleaning & Maint | Gutter cleaning /linear foot (Subscription) | type='Exterior Cleaning & Maint' is labor-only |
| 1109 | Exterior Cleaning & Maint | Roof cleaning per Sq/Ft (Subscription) | type='Exterior Cleaning & Maint' is labor-only |
| 1232 | Electrical | LIFT 2L 8' T8s (Type B) 38W 4K FA8 | name matches /\bLIFT\b/ |
| 1112 | Custom Services | Custom Job | type='Custom Services' is labor-only |
| 1118 | Custom Services | Custom Job | type='Custom Services' is labor-only |
| 1099 | Window Cleaning | Commercial Hard to access Lift Windows (Subscription) | type='Window Cleaning' is labor-only |
| 1184 | Electrical | SBE 115W Cobra Head LIFT | name matches /\bLIFT\b/ |
| 1195 | Electrical | SBE 200W Highbay LIFT | name matches /\bLIFT\b/ |
| 1197 | Electrical | SBE 230W Cobra Head LIFT | name matches /\bLIFT\b/ |
| 1209 | Electrical | SBE 67W Wallpack LIFT | name matches /\bLIFT\b/ |
| 1242 | Electrical | LIFT 6L Adj. CCT T5 (Type B) 24W | name matches /\bLIFT\b/ |
| 1215 | Electrical | SBE 80W Highbay LIFT | name matches /\bLIFT\b/ |
| 1236 | Electrical | LIFT 2L 4' T8s (Type B) 9W 5K DBL | name matches /\bLIFT\b/ |
| 1207 | Electrical | SBE 45W Flood LIFT | name matches /\bLIFT\b/ |
| 1244 | Electrical | LIFT 4L 4' T8s (Type B) 9W 5K DBL | name matches /\bLIFT\b/ |
| 1213 | Electrical | SBE 75W Cobra Head LIFT | name matches /\bLIFT\b/ |
| 1234 | Electrical | LIFT 1L 4' T8s (Type B) 9W 5K DBL | name matches /\bLIFT\b/ |
| 1205 | Electrical | Adjustable Wall Packs w/Lift 50W/60W/80W/100W | name matches /\bLIFT\b/ |
| 1238 | Electrical | LIFT 3L 4' T8s (Type B) 9W 5K DBL | name matches /\bLIFT\b/ |
| 1263 | Electrical | LIFT Foldable Linear Highbay 290W/320W/350W Adj CTT | name matches /\bLIFT\b/ |
| 1291 | Electrical | SBE Traditional 30W Wallpack LIFT | name matches /\bLIFT\b/ |
| 1290 | Window Cleaning | General Cleaning | type='Window Cleaning' is labor-only |
| 1101 | Window Cleaning | Commercial Interior Window Cleaning (Subscription) | type='Window Cleaning' is labor-only |
| 1299 | Electrical | Vapor Tight Fixtures 60W/75W/90W w/ Lift | name matches /\bLIFT\b/ |
| 1297 | Electrical | Vapor Tight Fixtures 20W/25W/30W w/ Lift | name matches /\bLIFT\b/ |
| 1254 | Electrical | LIFT 2L 6" U-bend Universal (Type A&B) 16.5W | name matches /\bLIFT\b/ |
| 1259 | Electrical | LIFT Foldable Linear Highbay 145W/160W/175W Adj CCT | name matches /\bLIFT\b/ |
| 1261 | Electrical | LIFT Foldable Linear Highbay 180W/200W/220W Adj CCT | name matches /\bLIFT\b/ |
| 1265 | Electrical | LIFT Foldable Linear Highbay 360W/400W/440W Adj CCT | name matches /\bLIFT\b/ |
| 1294 | Electrical | Troffer Retrofit Kit 15W/19W/24W/29W w/ Lift | name matches /\bLIFT\b/ |
| 1293 | Electrical | Troffer Retrofit Kit 24W/29W32W/39W w/lift | name matches /\bLIFT\b/ |
| 1457 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W w/ Lift w/ Controls | name matches /\bLIFT\b/ |
| 1396 | Electrical | SMBE 290W/320W/350W Highbay Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1303 | Electrical | Vapor Tight High Bays 60W/75W/90W w/ Lift | name matches /\bLIFT\b/ |
| 1305 | Electrical | Vapor Tight High Bays 120W/150W/180W w/ Lift | name matches /\bLIFT\b/ |
| 1301 | Electrical | Vapor Tight Fixtures 25W/30W/60W w/ Lift | name matches /\bLIFT\b/ |
| 1283 | Electrical | LIFT 3L 4' T8s (Type B) 9W 4K DBL | name matches /\bLIFT\b/ |
| 1288 | Electrical | LIFT 4' T8  (Type B) 9W/12W/15W/17W Adj. & CCT | name matches /\bLIFT\b/ |
| 1285 | Electrical | LIFT 4L 4' T8s (Type B) 9W 4K DBL | name matches /\bLIFT\b/ |
| 1246 | Electrical | LIFT 6L 4' T8s (Type B) 9W 5K DBL | name matches /\bLIFT\b/ |
| 1309 | Electrical | Tri-Proof Vapor Tight Fixtures 30W/40W/50W w/ Lift | name matches /\bLIFT\b/ |
| 1313 | Electrical | Tri-Proof Vapor Tight Fixtures 30W/40W/50W w/ Lift | name matches /\bLIFT\b/ |
| 1311 | Electrical | Tri-Proof Vapor Tight Fixtures 60W/80W/100W w/ Lift | name matches /\bLIFT\b/ |
| 1307 | Electrical | Tri-Proof Vapor Tight Fixtures 20W/25W/30W w/ Lift | name matches /\bLIFT\b/ |
| 1322 | Electrical | Indoor Control W/ Lift | name matches /\bLIFT\b/ |
| 1315 | Electrical | Backlit Panels 20W/25W/30W w/ Lift | name matches /\bLIFT\b/ |
| 1455 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1464 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W Relocate w/ Controls | name matches /\bRelocat(e|ion)\b/ |
| 1395 | Electrical | SMBE 360W/400W/440W Highbay LIFT | name matches /\bLIFT\b/ |
| 1325 | Electrical | Outdoor Control W/ Lift | name matches /\bLIFT\b/ |
| 1317 | Electrical | Backlit Panels 20W/25W/30W w/ Lift | name matches /\bLIFT\b/ |
| 1454 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W w/ Lift | name matches /\bLIFT\b/ |
| 1327 | Electrical | Troffers 15W/19W/24W/29W EMB w/ Lift | name matches /\bLIFT\b/ |
| 1329 | Electrical | Troffers 24W/29W/32W/39W EMB w/ Lift | name matches /\bLIFT\b/ |
| 1413 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) w/ Lift | name matches /\bLIFT\b/ |
| 1071 | Commercial Window Cleaning | Commercial Exterior 2nd story Window Cleaning (Subscription) | type='Commercial Window Cleaning' is labor-only |
| 1338 | Window Cleaning | Stone Replace Includes (Per Stone) | type='Window Cleaning' is labor-only |
| 1333 | Window Cleaning | Door Toe Kick | type='Window Cleaning' is labor-only |
| 1332 | Window Cleaning | Doors Per Panel | type='Window Cleaning' is labor-only |
| 1336 | Window Cleaning | Railing Rubberized Foot | type='Window Cleaning' is labor-only |
| 1337 | Exterior Cleaning & Maint | Paint Poles up to 30' | type='Exterior Cleaning & Maint' is labor-only |
| 1334 | Exterior Cleaning & Maint | Paint Railing Per Foot | type='Exterior Cleaning & Maint' is labor-only |
| 1335 | Exterior Cleaning & Maint | Paint Single Railing Per Foot | type='Exterior Cleaning & Maint' is labor-only |
| 1319 | Electrical | Backlit Panels 30W/35W/40W w/ Lift | name matches /\bLIFT\b/ |
| 1107 | Window Cleaning | Soft Wash -Pressure Washing Sq/Ft (Subscription) | type='Window Cleaning' is labor-only |
| 1461 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1340 | Exterior Cleaning & Maint | Curb Painting Per Foot | type='Exterior Cleaning & Maint' is labor-only |
| 1079 | Commercial Window Cleaning | Commercial Glass Repellant | type='Commercial Window Cleaning' is labor-only |
| 1460 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W w/ Lift | name matches /\bLIFT\b/ |
| 1505 | Electrical | ES LIFT | name matches /\bLIFT\b/ |
| 1346 | Window Cleaning | Building Washing Per Sq. Ft. 2 Bottom Floors | type='Window Cleaning' is labor-only |
| 1342 | Window Cleaning | Refinish Beams Per Running Foot | type='Window Cleaning' is labor-only |
| 1345 | Window Cleaning | Pressure Washing Per Sq. Ft. over 10,000 sq. ft. | type='Window Cleaning' is labor-only |
| 1359 | Electrical | Strip Light 48W/68W/90W w/ Lift | name matches /\bLIFT\b/ |
| 1360 | Electrical | Strip Light 48W/68W/90W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1398 | Electrical | SMBE  290W/320W/350W Highbay Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1347 | Window Cleaning | Building Washing per Sq. Ft. above 2nd Floor - Add Lift | type='Window Cleaning' is labor-only |
| 1348 | Window Cleaning | Stucco Patch Per Hole After 5 | type='Window Cleaning' is labor-only |
| 1343 | Window Cleaning | Refinish Beams Perf Running Foot - Lift | type='Window Cleaning' is labor-only |
| 1339 | Window Cleaning | Reattaching Stone | type='Window Cleaning' is labor-only |
| 1344 | Window Cleaning | Pressure Washing Per Sq. Ft. up to 10,000 sq. ft. | type='Window Cleaning' is labor-only |
| 1341 | Exterior Cleaning & Maint | Vent Replacement Up to 18" x 18" | type='Exterior Cleaning & Maint' is labor-only |
| 1473 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W w/ Lift/Controls | name matches /\bLIFT\b/ |
| 1371 | Electrical | SMBE 70W/90W/110W Highbay Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1103 | Window Cleaning | Commercial Glass Repellant (Subscription) | type='Window Cleaning' is labor-only |
| 1376 | Electrical | Foldable Linear Highbay 70W/90W/110W w/ Lift | name matches /\bLIFT\b/ |
| 1366 | Electrical | LIFT Foldable Linear Highbay 70W/90W/110W Adj CCT w/ Control | name matches /\bLIFT\b/ |
| 1372 | Electrical | SMBE 70W/90W/110W Highbay Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1375 | Electrical | SMBE 70W/90W/110W Highbay Relocate/Controls | name matches /\bRelocat(e|ion)\b/ |
| 1378 | Electrical | SMBE 145W/160W/175W Highbay Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1383 | Electrical | SMBE 145W/160W/175W Highbay Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 1409 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) w/ Lift | name matches /\bLIFT\b/ |
| 1211 | Electrical | Copy of SBE 70W Flood LIFT | name matches /\bLIFT\b/ |
| 1067 | Window Cleaning | Window Screen Repair/Replacement | type='Window Cleaning' is labor-only |
| 1479 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1463 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W w/ Lift w/ Controls | name matches /\bLIFT\b/ |
| 1399 | Electrical | SMBE 360W/400W/440W Highbay Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1394 | Electrical | SMBE 290W/320W/350W Highbay LIFT | name matches /\bLIFT\b/ |
| 1429 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) w/ Lift w/ Controls | name matches /\bLIFT\b/ |
| 1240 | Electrical | LIFT 4L Adj. CCT T5 (Type B) 24W | name matches /\bLIFT\b/ |
| 1417 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) Relocated w/ Lift | name matches /\bLIFT\b/ |
| 1419 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) Relocated w/ Lift | name matches /\bLIFT\b/ |
| 1482 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W Relocate/Controls | name matches /\bRelocat(e|ion)\b/ |
| 1287 | Electrical | LIFT 6L 4' T8s (Type B) 9W 4K DBL | name matches /\bLIFT\b/ |
| 1445 | Electrical | SMBE Adjustable Mini Wallpack 8W/10W/15W/25W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1448 | Electrical | SMBE160W/200W/240W/320W Cobra Head Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1462 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1469 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W w/ Lift | name matches /\bLIFT\b/ |
| 1483 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 1487 | Electrical | SMBE Canopies 25W/50W/75W/100W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1477 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W w/ Lift | name matches /\bLIFT\b/ |
| 1478 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1470 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1227 | Electrical | LIFT -1L 8' T8s (Type B) 38W 5K FA8 | name matches /\bLIFT\b/ |
| 1491 | Electrical | SMBE Canopies 40W/50W/60W/75W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 2062 | Service | Post Construction Cleaning ($0.30/sqft) | type='Service' is labor-only |
| 1228 | Electrical | LIFT -1L 8' T8s (Type B) 38W 4K FA8 | name matches /\bLIFT\b/ |
| 1279 | Electrical | LIFT 1L 4' T8s (Type B) 9W 4K DBL | name matches /\bLIFT\b/ |
| 1281 | Electrical | LIFT 2L 4' T8s (Type B) 9W 4K DBL | name matches /\bLIFT\b/ |
| 1403 | Electrical | SMBE 290W/320W/350W Highbay Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 1486 | Electrical | SMBE Canopies 25W/50W/75W/100W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1498 | Electrical | SME Strip Light 60W/75W/80W Relocate w/ Controls | name matches /\bRelocat(e|ion)\b/ |
| 1485 | Electrical | SMBE Canopies 25W/50W/75W/100W w/ Lift | name matches /\bLIFT\b/ |
| 1406 | Electrical | SMBE 360W/400W/440W Highbay Relocate w/ Controls | name matches /\bRelocat(e|ion)\b/ |
| 1390 | Electrical | SMBE180W/200W/220W Highbay Relocate w/ Controls | name matches /\bRelocat(e|ion)\b/ |
| 1401 | Electrical | SMBE 290W/320W/350W Highbay LIFT w/ Controls | name matches /\bLIFT\b/ |
| 1387 | Electrical | SMBE 180W/200W/220W Highbay Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1481 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W w/ Lift/Controls | name matches /\bLIFT\b/ |
| 1090 | Window Cleaning | Sealing/Restoration Sq/Ft | type='Window Cleaning' is labor-only |
| 1489 | Electrical | SMBE Canopies 40W/50W/60W/75W  w/ Lift | name matches /\bLIFT\b/ |
| 1377 | Electrical | SMBE 145W/160W/175W Highbay LIFT | name matches /\bLIFT\b/ |
| 2086 | service | Annual Lighting Tune-Up | type='service' is labor-only |
| 1495 | Electrical | SMBE Strip Light 60W/70W/80W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1490 | Electrical | SMBE Canopies 40W/50W/60W/75W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 2084 | service | Extended Warranty (3-year) | type='service' is labor-only |
| 2085 | service | Extended Warranty (5-year) | type='service' is labor-only |
| 2075 | service | Energy Savings Projection Report | type='service' is labor-only |
| 2079 | service | Mobilization / Site Setup | type='service' is labor-only |
| 2082 | service | PCB / Hazmat Disposal | type='service' is labor-only |
| 2081 | service | Permit Handling Fee | type='service' is labor-only |
| 2074 | service | Photometric Design / Lighting Layout | type='service' is labor-only |
| 2078 | service | Project Management Fee | type='service' is labor-only |
| 2076 | service | ROI / Payback Analysis Document | type='service' is labor-only |
| 2087 | service | Smart Controls Programming Setup | type='service' is labor-only |
| 2077 | service | Spec & Cut Sheet Package | type='service' is labor-only |
| 2083 | service | Travel Fee (over 30 miles) | type='service' is labor-only |
| 2072 | service | Utility Incentive Processing Fee | type='service' is labor-only |
| 1381 | Electrical | SMBE 145W/160W/175W Highbay LIFT w/ Controls | name matches /\bLIFT\b/ |
| 1374 | Electrical | SMBE 70W/90W/110W Highbay Lift/Controls | name matches /\bLIFT\b/ |
| 2088 | service | Lighting Controls Training | type='service' is labor-only |
| 1499 | Electrical | SMBE Strip Light 60W/70W/80W Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 2028 | Window Cleaning | Store Front In/Out Window Cleaning | type='Window Cleaning' is labor-only |
| 2089 | service | M&V (Measurement & Verification) Report | type='service' is labor-only |
| 2093 | service | Priority Response SLA | type='service' is labor-only |
| 2092 | service | Sustainability / ESG Reporting Package | type='service' is labor-only |
| 2090 | service | Title 24 / IECC Energy Code Compliance Package | type='service' is labor-only |
| 2027 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W Relocate w/ Lift & Control | name matches /\bLIFT\b/ |
| 2026 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 2024 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W w/ Lift | name matches /\bLIFT\b/ |
| 2025 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W w/ Lift & Control | name matches /\bLIFT\b/ |
| 2023 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W Relocate w/ Control | name matches /\bRelocat(e|ion)\b/ |
| 2022 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1385 | Electrical | SMBE 180W/200W/220W Highbay LIFT | name matches /\bLIFT\b/ |
| 2080 | service | After-Hours / Weekend Premium | type='service' is labor-only |
| 1493 | Electrical | SMBE Strip Light 60W/70W/80W w/ Lift | name matches /\bLIFT\b/ |
| 1111 | Window Cleaning | Sealing/Restoration Sq/Ft (Subscription) | type='Window Cleaning' is labor-only |
| 2091 | service | 179D Tax Deduction Documentation Support | type='service' is labor-only |
| 1402 | Electrical | SMBE 290W/320W/350W Highbay Relocate w/ Controls | name matches /\bRelocat(e|ion)\b/ |
| 1391 | Electrical | SMBE 180W/200W/220W Highbay Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 1423 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) Relocated/Lift/Controls | name matches /\bLIFT\b/ |
| 2073 | service | Facility Lighting Audit | type='service' is labor-only |
| 1497 | Electrical | SMBE Strip Light 60W/70W/80W w/ Lift w/ Controls | name matches /\bLIFT\b/ |
| 1456 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1421 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) w/ Lift w/ Controls | name matches /\bLIFT\b/ |
| 1407 | Electrical | SMBE 360W/400W/440W Highbay Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 1449 | Electrical | SMBE 75W/100W/120W/150W Cobra Head Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1459 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 1458 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W Relocate w/ Controls | name matches /\bRelocat(e|ion)\b/ |
| 2016 | Electrical | 100W Wall Pack Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1465 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W Relocate/Lift/Controls | name matches /\bLIFT\b/ |
| 2014 | Electrical | 100W Wall Pack Relocate | name matches /\bRelocat(e|ion)\b/ |
| 2018 | Electrical | SBE 100W Wall Pack Relocate | name matches /\bRelocat(e|ion)\b/ |
| 2019 | Electrical | SBE 100W Wall Pack Relocate w/ Lift | name matches /\bLIFT\b/ |
| 2015 | Electrical | 100W Wall Pack w/ Lift | name matches /\bLIFT\b/ |
| 1442 | Electrical | SMBE Adjustable Mini Wallpack 8W/10W/15W/25W w/ Lift | name matches /\bLIFT\b/ |
| 1427 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) Relocated/Lift/Controls | name matches /\bLIFT\b/ |
| 1443 | Electrical | SMBE Adjustable Wall Packs 20W/30W/40W/50W Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1411 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) w/ Lift | name matches /\bLIFT\b/ |
| 1952 | Electrical | LIFT Scissor | name matches /\bLIFT\b/ |
| 1471 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1425 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) w/ Lift w/ Controls | name matches /\bLIFT\b/ |
| 1181 | Electrical | SMBE 70W/90W/110W Highbay LIFT | name matches /\bLIFT\b/ |
| 1475 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W Relocate /Lift/Controls | name matches /\bLIFT\b/ |
| 1386 | Electrical | SMBE180W/200W/220W Highbay Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1415 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) Relocated w/ Lift | name matches /\bLIFT\b/ |
| 1370 | Electrical | SMBE 70W/90W/110W Highbay Relocation/Lift/Control | name matches /\bLIFT\b/ |
| 1230 | Electrical | LIFT 2L 8' T8s (Type B) 38W 5K FA8 | name matches /\bLIFT\b/ |
| 1405 | Electrical | SMBE 360W/400W/440W Highbay LIFT w/ Controls | name matches /\bLIFT\b/ |
| 1382 | Electrical | SMBE 145W/160W/175W Highbay Relocate w/ Controls | name matches /\bRelocat(e|ion)\b/ |
| 1379 | Electrical | SMBE 145W/160W/175W Highbay Relocate w/ Lift | name matches /\bLIFT\b/ |
| 1389 | Electrical | SMBE 180W/200W/220W Highbay LIFT w/ Controls | name matches /\bLIFT\b/ |
| 1201 | Electrical | Adjustable Wall Packs w/Lift 20W/30W/40W/50W | name matches /\bLIFT\b/ |
| 1080 | Window Cleaning | Basic Tract Home Post Construction Window Cleaning | type='Window Cleaning' is labor-only |
| 1088 | Exterior Cleaning & Maint | Gutter cleaning /linear foot | type='Exterior Cleaning & Maint' is labor-only |
| 1362 | Electrical | LIFT Foldable Linear Highbay 180W/200W/220W Adj CCT Relocated | name matches /\bLIFT\b/ |
| 1257 | Electrical | LIFT Foldable Linear Highbay 70W/90W/110W Adj CCT | name matches /\bLIFT\b/ |
| 1105 | Window Cleaning | Residential Glass Protectant | type='Window Cleaning' is labor-only |
| 1397 | Electrical | SMBE 360W/400W/440W Highbay Relocate | name matches /\bRelocat(e|ion)\b/ |
| 1474 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W Relocate/Controls | name matches /\bRelocat(e|ion)\b/ |
| 1431 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) Relocated/Lift/Controls | name matches /\bLIFT\b/ |
| 1095 | Window Cleaning | Shower Glass Restoration (Subscription) | type='Window Cleaning' is labor-only |

### Full classification reference

<details><summary>All material-labeled products (click to expand)</summary>

| ID | Type | Name | Cost |
|---|---|---|---:|
| 2124 | Electrical Services (Bundles) | MES 150/165/180/200/220W Highbay - 2ft | $81.5 |
| 1260 | Electrical | Foldable Linear Highbay 180W/200W/220W Adj CCT | $160.66 |
| 1139 | Electrical | MID 11W Puck | $19.55 |
| 1138 | Electrical | MID 115W Cobra Head | $194 |
| 1954 | Electrical Services (Bundles) | LEDONE Wrap Fixture 30W/40W/50W/60W | $73.64 |
| 1135 | Electrical | ESL Adjustable Commercial Can 8" | $48.43 |
| 1113 | Google | Siding installation | $0 |
| 1114 | Google | Siding removal | $0 |
| 1115 | Google | Remodeling | $0 |
| 1116 | Google | Repair & maintenance | $0 |
| 1117 | Google | Other | $0 |
| 1136 | Electrical | Gas Station Canopy 60W | $90.15 |
| 1137 | Electrical | MID 100W Highbay | $91 |
| 1150 | Electrical | MID 2L T8 4ft Per Lamp | $15.5 |
| 1502 | Electrical | WL Wrap Control | $32 |
| 1127 | Incentives | Utility Incentive | $0 |
| 1128 | Electrical | 2ft T8 Type B 9w | $6.6 |
| 1130 | Electrical | 4ft T8 Type B 12w | $7.6 |
| 1131 | Electrical | ALL Emergency T8 4' 15W Type B | $60.33 |
| 1132 | Electrical | Cooper 12W Wallpack | $150 |
| 1133 | Electrical | Cooper TT Canopy D3 | $541 |
| 1141 | Electrical | MID 15W Flood | $78 |
| 1151 | Electrical | MID 2L UBend 2ft Per Lamp | $21.5 |
| 1162 | Electrical | MID 5L T8 4ft Per Lamp | $14.9 |
| 1144 | Electrical | MID 1L T8 4ft Per Lamp | $14.9 |
| 1142 | Electrical | MID 15W Mini Wallpack | $75.16 |
| 1143 | Electrical | MID 1L 8ft Lamp | $23.5 |
| 1145 | Electrical | MID 200W Highbay | $195.11 |
| 1146 | Electrical | MID 230W Cobra Head | $237.91 |
| 1147 | Electrical | MID 27W Wallpack | $83 |
| 1148 | Electrical | MID 2L 8ft Lamp | $23.5 |
| 1149 | Electrical | MID 2L T5 4ft Per Lamp | $35 |
| 1152 | Electrical | MID 2x2 50W Panel SLCT | $76.58 |
| 1153 | Electrical | MID 320W Highbay | $35 |
| 1154 | Electrical | MID 36W LED Cob Selectable | $52.94 |
| 1156 | Electrical | MID 3L T8 4ft Per Lamp | $14.9 |
| 1157 | Electrical | MID 40W Wallpack | $76.5 |
| 1158 | Electrical | MID 4L T5 4ft Lamp | $20.5 |
| 1159 | Electrical | MID 4L T8 4ft Per Lamp | $15.5 |
| 1160 | Electrical | MID 50W Panel SLCT | $89.95 |
| 1163 | Electrical | MID 67W Wallpack | $90.4 |
| 1164 | Electrical | MID 6L T5 4ft Per Lamp | $20.5 |
| 1165 | Electrical | MID 6L T8 4ft Per Lamp | $14.9 |
| 1167 | Electrical | MID 80W Highbay | $115 |
| 1168 | Electrical | MID A19 9W | $4.8 |
| 1169 | Electrical | MID BR30 12W | $7.8 |
| 1170 | Electrical | MID Canopy 100W | $124.23 |
| 1171 | Electrical | MID Canopy 60W | $80 |
| 1173 | Electrical | MID COOP 123W SLCT Highbay Linx | $200 |
| 1174 | Electrical | MID COOP 30W WSL Linear | $330.5 |
| 1175 | Electrical | MID COOP 42W ACC Troffer | $262.5 |
| 1177 | Electrical | MID COOP 71W ACC Troffer | $361.04 |
| 1178 | Electrical | MID COOP 71W ACC Troffer EM | $543.71 |
| 1179 | Electrical | MID Flood 45W | $74.8 |
| 1180 | Electrical | MID Flood 70W | $35 |
| 1182 | Electrical | MID Mr. 17W Wallpack | $60.2 |
| 1186 | Electrical | Mr. Canopy 40W | $73.8 |
| 1188 | Electrical | Mr. Flood 135W | $146 |
| 1190 | Electrical | Mr. Flood 200W | $120 |
| 1191 | Electrical | Mr. Flood 45W | $74.8 |
| 1192 | Electrical | Mr. Slim Wall Pack 27W | $56 |
| 1198 | Electrical | Mr. Slim Wall Pack 67W | $91.4 |
| 1200 | Electrical | Mr. Wall Pack 70W (Traditional Look) | $71 |
| 1202 | Electrical | NSF Rated 100W Highbay | $125.9 |
| 1203 | Electrical | NSF Rated 200W Highbay | $150 |
| 1196 | Electrical | SBE 230W Cobra Head | $331.41 |
| 1183 | Electrical | SBE 115W Cobra Head | $224.25 |
| 1140 | Electrical | MID 15/20/30W SLCT | $96.25 |
| 1231 | Electrical | 2L 8' T8s (Type B) 38W 4K FA8 | $35.54 |
| 1229 | Electrical | 2L 8' T8s (Type B) 38W 5K FA8 | $36.24 |
| 1237 | Electrical | 3L 4' T8s (Type B) 9W 5K DBL | $25.25 |
| 1239 | Electrical | 4L Adj. CCT T5 (Type B) 24W | $51 |
| 1245 | Electrical | 6L 4' T8s (Type B) 9W 5K DBL | $41.4 |
| 1206 | Electrical | SBE 45W Flood | $199 |
| 1251 | Electrical | 1L Adj. CCT 2' T8s 7W | $17.26 |
| 1210 | Electrical | SBE 70W Flood | $138.3 |
| 1216 | Electrical | SBE A19 9W | $7.76 |
| 1218 | Electrical | SBE Adjustable Commercial Can 8" | $94.68 |
| 1208 | Electrical | SBE 67W Wallpack | $161.66 |
| 1214 | Electrical | SBE 80W Highbay | $205 |
| 1503 | Electrical | WL Panel & Strip Control | $26 |
| 1222 | Electrical | SBE Traditional 30W Wallpack | $133.8 |
| 1226 | Electrical | 1L 8' T8s (Type B) 38W 5K FA8 | $23.37 |
| 1155 | Electrical | MID 3L T5 4ft Per Lamp | $20.5 |
| 1212 | Electrical | SBE 75W Cobra Head | $200.57 |
| 1219 | Electrical | SBE BR30 9W | $10.75 |
| 1220 | Electrical | SBE Canopy New Fixture 60W | $181 |
| 1221 | Electrical | SBE SUN 38W 4ft Strip Retrofit Kit | $67.75 |
| 1224 | Electrical | 1L 8' T8s (Type B) 38W 4K FA8 | $22.67 |
| 1248 | Electrical | 1L Adj. CCT,3' T8s 11W | $12.81 |
| 1235 | Electrical | 2L 4' T8s (Type B) 9W 5K DBL | $20.1 |
| 1225 | Electrical | 2L 6" U-bend Universal (Type A&B) 16.5W | $37.59 |
| 1247 | Electrical | 2L Adj. CCT,3' T8s 11W | $21.42 |
| 1249 | Electrical | 3L Adj. CCT,3' T8s 11W | $29.33 |
| 1250 | Electrical | 4L Adj. CCT,3' T8s 11W | $36.54 |
| 1241 | Electrical | 6L Adj. CCT T5 (Type B) 24W | $72.3 |
| 1253 | Electrical | 4L Adj. CCT 2' T8s 7W | $39.64 |
| 1286 | Electrical | 6L 4' T8s (Type B) 9W 4K DBL | $41.4 |
| 1273 | Electrical | Commercial Down Lights 10W/15W/22W Adj CCT | $50.48 |
| 1292 | Electrical | Troffer Retrofit Kit 24W/29W32W/39W | $86.25 |
| 1289 | Electrical | 4' T8  (Type B) 9W/12W/15W/17W Adj. & CCT | $127.9 |
| 1161 | Electrical | MID 5L T5 4ft Per Lamp | $18.7 |
| 1252 | Electrical | 2L Adj. CCT 2' T8s 7W | $24.72 |
| 1264 | Electrical | Foldable Linear Highbay 360W/400W/440W Adj CCT | $217.31 |
| 1275 | Electrical | Copy of Commercial Down Lights 10W/15W/22W Adj CCT | $50.48 |
| 1298 | Electrical | Vapor Tight Fixtures 60W/75W/90W | $202.89 |
| 1296 | Electrical | Vapor Tight Fixtures 20W/25W/30W | $98.34 |
| 1276 | Electrical | Copy of Commercial Down Lights 10W/15W/22W Adj CCT | $50.48 |
| 1258 | Electrical | Foldable Linear Highbay 145W/160W/175W Adj CCT | $130.79 |
| 1262 | Electrical | Foldable Linear Highbay 290W/320W/350W Adj CTT | $217.31 |
| 1255 | Electrical | Foldable Linear Highbay 70W/90W/110W | $95.77 |
| 1256 | Electrical | Foldable Linear Highbay 70W/90W/110W Adj CCT | $106.07 |
| 1295 | Electrical | Troffer Retrofit Kit 15W/19W/24W/29W | $71.25 |
| 1278 | Electrical | 1L 4' T8s (Type B) 9W 4K DBL | $14.95 |
| 1282 | Electrical | 3L 4' T8s (Type B) 9W 4K DBL | $25.25 |
| 1284 | Electrical | 4L 4' T8s (Type B) 9W 4K DBL | $31.1 |
| 1271 | Electrical | Commercial Down Lights 20W/25W/32W Adj CCT | $60.27 |
| 1270 | Electrical | Commercial Down Lights 5.5W/8W/12W Adj CCT | $36.58 |
| 1272 | Electrical | Commercial Down Lights 7W/10W/16W Adj CCT | $36.58 |
| 1266 | Electrical | UFO High Bay 180W/200W/250W Adj CCT | $283.6 |
| 1268 | Electrical | UFO High Bay 300W | $327.89 |
| 1267 | Electrical | UFO High Bay 80W/100W/150W Adj CCT | $235.7 |
| 1269 | Electrical | UFO High Bay 80W/100W/150W Adj CCT WHT | $251.15 |
| 1274 | Electrical | Copy of Commercial Down Lights 10W/15W/22W Adj CCT | $50.48 |
| 1956 | Electrical Services (Bundles) | LEDONE 145W/160W/175W Highbay | $95.79 |
| 1304 | Electrical | Vapor Tight High Bays 120W/150W/180W | $257.99 |
| 1302 | Electrical | Vapor Tight High Bays 60W/75W/90W | $191.56 |
| 1300 | Electrical | Vapor Tight Fixtures 25W/30W/60W | $104.01 |
| 1504 | Electrical | HB Controls Only | $32 |
| 1166 | Electrical | MID 75W Cobra Head | $138.5 |
| 1306 | Electrical | Tri-Proof Vapor Tight Fixtures 20W/25W/30W | $82.38 |
| 1312 | Electrical | Tri-Proof Vapor Tight Fixtures 30W/40W/50W | $133.56 |
| 1308 | Electrical | Tri-Proof Vapor Tight Fixtures 30W/40W/50W | $88.56 |
| 1310 | Electrical | Tri-Proof Vapor Tight Fixtures 60W/80W/100W | $128.21 |
| 1320 | Electrical | Exit Sign 1W | $55.08 |
| 1321 | Electrical | Exit Sign 1W | $55.08 |
| 1323 | Electrical | Indoor Control | $37.8 |
| 1172 | Electrical | MID Canopy 75W | $106.39 |
| 1324 | Electrical | Outdoor Control | $239.25 |
| 1326 | Electrical | Troffers 15W/19W/24W/29W EMB | $156.54 |
| 1328 | Electrical | Troffers 24W/29W/32W/39W EMB | $196.71 |
| 1331 | Electrical | Adjustable Area Lights 75W/100W/120W/150W | $264.15 |
| 1314 | Electrical | Backlit Panels 20W/25W/30W | $77.23 |
| 1318 | Electrical | Backlit Panels 30W/35W/40W | $84.95 |
| 1316 | Electrical | Backlit Panels 20W/25W/30W | $75.17 |
| 1361 | Electrical | Foldable Linear Highbay 70W/90W/110W Adj CCT Relocated | $221.07 |
| 1349 | Electrical | Old Product - 100W Highbay | $114.61 |
| 1176 | Electrical | MID COOP 42W ACC Troffer EM | $450.92 |
| 1358 | Electrical | Strip Light 48W/68W/90W | $121.52 |
| 1352 | Electrical | 4L Troffer 50W 4' Retrofit Kit | $89.49 |
| 1353 | Electrical | 6L Troffer 36W 4' Retrofit Kit | $111.13 |
| 1354 | Electrical | 6L Troffer 50W 4' Retrofit Kit | $128.11 |
| 1355 | Electrical | 8L Troffer 36W 4' Retrofit Kit | $144.09 |
| 1356 | Electrical | 8L Troffer 50W 4' Retrofit Kit | $166.73 |
| 1363 | Electrical | Adjustable Area Lights 160W/200W/240W/320W Remount | $391.34 |
| 1357 | Electrical | Backlit Panels 30W/35W/40W Relocated | $154.95 |
| 1351 | Electrical | 4L Troffer 36W 4' Retrofit Kit | $78.17 |
| 1187 | Electrical | SBE 130W Post Top Adj | $35 |
| 1364 | Electrical | Copy of Backlit Panels 30W/35W/40W | $84.95 |
| 1368 | Electrical | Wrap Fixture 30W/40W/50W/60W | $108.64 |
| 1369 | Electrical | Wrap Fixture 22W/28W/34W/44W | $106.58 |
| 1373 | Electrical | SMBE 70W/90W/110W Highbay w/ Controls | $0 |
| 1367 | Electrical | Foldable Linear Highbay 290W/320W/350W Adj CTT w/ contorl | $242.31 |
| 1185 | Electrical | Mr. 17W Wall Mount | $33 |
| 1365 | Electrical | Strip Light 48W/68W/90W W/ Control | $146.52 |
| 1388 | Electrical | SMBE 180W/200W/220W Highbay w/ Controls | $0 |
| 1384 | Electrical | SMBE 180W/200W/220W Highbay | $0 |
| 2127 | Electrical Services (Bundles) | MES 36W 2x2 Backlit Panel | $65 |
| 1194 | Electrical | Mr. Slim Wall Pack 40W | $72.2 |
| 1392 | Electrical | SMBE 360W/400W/440W Highbay | $0 |
| 1412 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) | $0 |
| 1404 | Electrical | SMBE 360W/400W/440W Highbay w/ Controls | $0 |
| 2105 | Electrical Services (Bundles) | Backlit Panels 20W/25W/30W (1X4) (MES) | $39.5 |
| 1418 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) Relocated | $0 |
| 1223 | Electrical | OG 40W Vapor Tight No Dim | $54.75 |
| 1424 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) w/ Controls | $0 |
| 1428 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) w/ Controls | $0 |
| 1430 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) Relocated w/ Lifts | $0 |
| 1414 | Electrical | SMBE Backlit Panels 30W/35W/40W (2X4) Relocated | $0 |
| 1420 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) w/ Controls | $0 |
| 2005 | Electrical Services (Bundles) | LEDONE Canopy 25W/50W/75W/100W | $77.76 |
| 1451 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W | $0 |
| 1441 | Electrical | SMBE Adjustable Wall Packs 50W/60W/80W/100W | $0 |
| 1450 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W | $0 |
| 2106 | Electrical Services (Bundles) | Backlit Panels 20W/25W/30W (2X2) (MES) | $35.1 |
| 1277 | Electrical | Residential Down Lights 7W Adj CTT | $13.92 |
| 1506 | Electrical | LEDONE Wrap Fixture 22W/28W/34W/44W | $71.58 |
| 1452 | Electrical | SMBE Wrap Fixture 30W/40W/50W/60W w/ Controls | $0 |
| 1453 | Electrical | SMBE Wrap Fixture 22W/28W/34W/44W w/ Controls | $0 |
| 1440 | Electrical | SMBE Adjustable Wall Packs 20W/30W/40W/50W | $0 |
| 1468 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W | $0 |
| 2107 | Electrical Services (Bundles) | Backlit Panels 30W/35W/40W (2X4) (MES) | $43.5 |
| 1189 | Electrical | SBE 15W Mini Wallpack | $115.16 |
| 1484 | Electrical | SMBE Canopies 25W/50W/75W/100W | $0 |
| 1488 | Electrical | SMBE Canopies 40W/50W/60W/75W | $0 |
| 1466 | Energy Efficiency | SMBE Canopy New Fixture 60W | $181 |
| 1350 | Electrical | Hexagon Lights /Garage Bay | $422.4 |
| 1204 | Electrical | Adjustable Wall Packs 50W/60W/80W/100W | $138.51 |
| 1217 | Electrical | SBE Adjustable Commercial Can 6" | $83.22 |
| 1496 | Electrical | SMBE Strip Light 60W/70W/80W w/ Controls | $0 |
| 1501 | Electrical | WL HB Control | $32 |
| 1507 | Electrical | Relocation Accessories/Materials | $35 |
| 1193 | Electrical | SMBE 145W/160W/175W Highbay | $0 |
| 1500 | Electrical | SMBE Adjustable Mini Wallpack 8W/10W/15W/25W | $0 |
| 1480 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W w/ Controls | $0 |
| 1393 | Electrical | SMBE 290W/320W/350W Highbay | $0 |
| 2108 | Electrical Services (Bundles) | Vapor Tight Fixtures 25W/35W/50W (MES) | $67.5 |
| 2094 | Electrical Services (Bundles) | 70W/90W/110W Highbay (MES) | $65.8 |
| 2110 | Electrical Services (Bundles) | Canopy 40W/50W/60W/75W (MES) | $45 |
| 1446 | Electrical | SMBE 160W/200W/240W/320W Cobra Head | $0 |
| 1408 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) | $0 |
| 1416 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) Relocated | $0 |
| 1467 | Energy Efficiency | SMBE Canopy New Fixture 60W Relocation | $251 |
| 2007 | Electrical Services (Bundles) | WL 30/40/50/60/72W Panel 2x4 | $45 |
| 2020 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W | $0 |
| 2021 | Electrical | LEDONE 8ft Strip Light 60W/70W/90W w/ Control | $0 |
| 2008 | Electrical Services (Bundles) | WL 12/17/22/27/32W Panel 2x2 | $35 |
| 1380 | Electrical | SMBE 145W/160W/175W Highbay w/ Controls | $0 |
| 1422 | Electrical | SMBE Backlit Panels 20W/25W/30W (1X4) Relocated w/ Controls | $0 |
| 2111 | Electrical Services (Bundles) | 130/150/165W Highbay (MES) | $72.5 |
| 2113 | Electrical Services (Bundles) | 130/150/165W Highbay (MES) | $72.5 |
| 2095 | Electrical Services (Bundles) | 180W/200W/220W Highbay (MES) | $81.5 |
| 2115 | Electrical Services (Bundles) | 90W/110W/130W/150W/165W Highbay (MES) | $72.5 |
| 2116 | Electrical Services (Bundles) | 150W/165W/180W/200W/220W Highbay (MES) | $81.5 |
| 2096 | Electrical Services (Bundles) | 290W/320W/350W Highbay (MES) | $175 |
| 1476 | Electrical | SMBE Vapor Tight Fixtures 60W/75W/90W | $0 |
| 2103 | Electrical Services (Bundles) | Strip Light 48W/68W/90W (MES) | $42 |
| 1400 | Electrical | SMBE 290W/320W/350W Highbay w/ Controls | $0 |
| 2117 | Electrical Services (Bundles) | 220W/280W/320W/360W/400W Highbay (MES) | $175 |
| 2097 | Electrical Services (Bundles) | 360W/400W/440W Highbay (MES) | $175 |
| 2121 | Electrical Services (Bundles) | 2x4 Backlit Panel Retrofit Kit 35W/40W/46W (MES) | $53.5 |
| 2012 | Electrical Services (Bundles) | WL 220/275/300 Highbay | $134 |
| 2104 | Electrical Services (Bundles) | Strip Light 60W/70W/80W (MES) | $68 |
| 2118 | Electrical Services (Bundles) | 105W/135W/155W/180W Highbay (MES) | $81.5 |
| 2098 | Electrical Services (Bundles) | Adjustable Area Lights 75W/100W/120W/150W (MES) | $98.5 |
| 1410 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) | $0 |
| 1426 | Electrical | SMBE Backlit Panels 20W/25W/30W (2X2) Relocated w/ Controls | $0 |
| 2013 | Electrical | 100W Wall Pack | $0 |
| 2099 | Electrical Services (Bundles) | Adjustable Area Lights 160W/200W/240W/320W (MES) | $145.5 |
| 2119 | Electrical Services (Bundles) | 2x2 Backlit Panel Retrofit Kit 20W/25W/30W (MES) | $35.1 |
| 2112 | Electrical Services (Bundles) | 70/90/110W Highbay (MES) | $65.8 |
| 2017 | Electrical | SBE 100W Wall Pack | $0 |
| 2100 | Electrical Services (Bundles) | Mini Wall Pack 8W/10W/15W/25W (MES) | $36.75 |
| 2114 | Electrical Services (Bundles) | 50W/60W/70W/90W/110W Highbay (MES) | $65.8 |
| 2101 | Electrical Services (Bundles) | Adjustable Wall Packs 20W/30W/40W/50W (MES) | $59.75 |
| 2120 | Electrical Services (Bundles) | 2x4 Backlit Panel Retrofit Kit 23W/30W/36W (MES) | $51.5 |
| 2004 | Electrical Services (Bundles) | WL Vapor Tight Control | $65 |
| 2109 | Electrical Services (Bundles) | Vapor Tight Fixtures 60W/75W/90W (MES) | $67.5 |
| 2102 | Electrical Services (Bundles) | Adjustable Wall Packs 50W/60W/80W/100W (MES) | $67.5 |
| 2122 | Electrical Services (Bundles) | MES 50/60/70/90/110W Highbay - 2ft | $65.8 |
| 1444 | Electrical | SMBE Adjustable Wall Packs 50W/60W/80W/100W Relocated | $0 |
| 2123 | Electrical Services (Bundles) | MES 90/110/130/150/165W Highbay - 2ft | $72.5 |
| 1134 | Electrical | ESL Adjustable Commercial Can 6" | $37.22 |
| 1125 | Electrical | SMBE 70W/90W/110W Highbay | $0 |
| 1233 | Electrical | 1L 4' T8s (Type B) 9W 5K DBL | $14.95 |
| 1447 | Electrical | SMBE 75W/100W/120W/150W Cobra Head | $0 |
| 1280 | Electrical | 2L 4' T8s (Type B) 9W 4K DBL | $20.1 |
| 1129 | Electrical | 4ft T5 Type B 15w | $8.2 |
| 1243 | Electrical | 4L 4' T8s (Type B) 9W 5K DBL | $31.1 |
| 1330 | Electrical | Adjustable Area Lights 160W/200W/240W/320W | $356.34 |
| 1199 | Electrical | Adjustable Wall Packs 20W/30W/40W/50W | $83.42 |
| 2125 | Electrical Services (Bundles) | MES 35/40/46W 2x4 Panel Retrofit Kit | $53.5 |
| 2126 | Electrical Services (Bundles) | MES 23/30/36W 2x4 Panel Retrofit Kit | $51.5 |
| 1472 | Electrical | SMBE Vapor Tight Fixtures 25W/35W/50W w/ Controls | $0 |

</details>

---

*Generated by `scripts/_classify_material_or_labor.mjs` on 2026-05-26. Re-run with `--apply` to refresh classifications after heuristic changes.*