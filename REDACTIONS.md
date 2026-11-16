# What was changed for publication

This repository is a single-commit copy of the study's private working repository as it stood at commit `5fee11b`. It holds 466 files from that commit. This file lists every difference between the two.

The private repository, with its full history and the original bytes of every file, is retained. Each changed file is listed below with the SHA-256 of its original and of its published form, so the original can be matched to this copy if it is ever supplied to a reviewer.

## Rules

Each rule replaces one kind of text with a fixed marker. No other byte of any file was changed.

| Rule | What it replaces | Marker | Replacements |
|---|---|---|---|
| U1 | local user name in a Windows or Git Bash path | `REDACTED_USER` | 438 |
| U2 | local user name in a macOS path or a path-derived folder name | `REDACTED_USER` | 2 |
| U3 | local user name in a macOS path | `REDACTED_USER` | 0 |
| O1 | model gateway account id | `user_REDACTED` | 4 |
| O2 | model gateway API-key hash in a vendor URL | `REDACTED` | 3 |
| N1 | name of the study operator's internet provider | `REDACTED_NETWORK` | 149 |
| N2 | network number of the study operator's internet provider | `0` | 149 |
| N3 | edge location code that names the study operator's city | `REDACTED` | 3289 |
| H1 | internal host name of the platform's test deployment | `REDACTED_TEST_HOST` | 1 |
| H2 | internal name of the platform's test deployment | `REDACTED_TEST_HOST` | 2 |
| H3 | internal name of the platform's production deployment | `REDACTED_PRODUCTION_HOST` | 3 |
| H4 | hosting region of the platform's test deployment | `REDACTED_REGION` | 1 |
| H5 | internal RPC host | `REDACTED_RPC_HOST` | 1 |
| X1 | signature of a third party's signed storage link returned by a web search | `REDACTED` | 1 |

None of the replaced text is a credential. Rule N2 writes `0` in place of the network number, and the marker for O2 follows the vendor's URL.

## What the rules do to the data

- Model answers, choices, tool calls and the pages the models were shown are unchanged except where a local file path, the gateway account id or the signed link (rules U1 to U3, O1, O2, X1) appears inside them.
- In the site request logs, the network name, network number and edge location are replaced only for requests that came from the study operator's own connection (N1, N2) or were served from the edge location nearest to it (N3). Requests from model vendors and other visitors keep their network name and number.
- No analysis script reads a replaced field. The analysis scripts for Studies 5, 6, 7, the Study 7 format test and Study 8 were run on the original and on the published files and gave identical output. The archived files of Studies 2, 3 and 4 and of the follow-up are unchanged.

## Checksums

`results-archive/SHA256SUMS.original` is the checksum list as archived during the study. `results-archive/SHA256SUMS` is the list for the files as published here. Of 36 archived files, 14 are byte-identical to the original and 22 differ only by the rules above. SHA-256 values quoted inside `PREREGISTRATION.md` and the results files refer to the original bytes.

## Files changed

| File | Rules applied (count) | SHA-256 of the original | SHA-256 as published |
|---|---|---|---|
| `PREREGISTRATION.md` | H1 (1), H3 (1) | `b0990812a47c49f838e442b161b24c13cc6606668be24a165bacc58ca224a4d0` | `ee696ff324d8e80fa5b065e69b2c7974f1a22a078fb6652a493e0d7ed5adb751` |
| `analysis/followup-results-2026-10-14.txt` | U1 (1) | `667477b100574b7bb7cf63e53eebb9805df393194f0b27611af66ab48ebc3227` | `a763489b2af616478db815483116d2a26c2aeadfb5fd263d63d688cc63bcfbd0` |
| `analysis/requirements.txt` | U1 (1) | `76f061cb9fda06dfa52147f1b87d0633c58c0c74173a05a8af6d1251aceaf900` | `2b01a06d170b56688b0d43a11782847cfe00b25c72640a52a175188694cc84ac` |
| `evidence/study5-smoke-2026-10-15.txt` | O2 (2) | `3c17f0971914112c378cd137b2d32f945f40925e14999b8aeb79e82dc70d0cd5` | `e9427d77c4e0911159a99c8cda6a1e790b7477876f855a8f5e45c67a63b84f72` |
| `fixtures/create-fixtures.ts` | H2 (1), H3 (1) | `27039dceb56bbb0ab9fb12a0915bf2d49dc21288530407eebe288f6ba409c12e` | `87bd1db57a22f35e5dc62ddaaafab48432ceb7863094e9ac9a7b71eaa991a587` |
| `fixtures/create-study6-mainnet.ts` | U1 (2) | `c183994d250377be0be1c8b857a8d130a068baad5f337fa15c27c883c91d6a6c` | `819326f054a0f54abd02179c63c98339969c3570a1f0cde55216781664668c1f` |
| `fixtures/seed-local-e2e.ts` | U2 (2) | `7751e6cbc7585fad1849caa107d92582fcf89df963054712e7767f4ada783f23` | `15467a91bf67fc89dd26a34ce172f4feddfeb97d3e0210433f396e4cda859126` |
| `harness/run-study6-live-counted.sh` | U1 (1) | `382164bafb02ac81a6db73ef992b3040d3c594aea7892ba39cd9ec62486318bb` | `67f32ca1fcf03653c7e2e132b468d13ca9ccc60410388e011ba888fd250fa75d` |
| `harness/run-study6-live-pilot.sh` | U1 (1) | `c9f9155cb43a71e888dfa4ca79d20819d0ace7ae019574935986dc28c8d19413` | `465987f3d1a2454e6a595a7b1ade9b7ad115712c152c5af06d298537eec3bc33` |
| `harness/run-study6-live-resume.sh` | U1 (1) | `7a2fb649b18375880c6678d6a244d6cae49efbe4d2efe959f2a577cfb8335d7b` | `10cd2b3dd7b71be61e6edc47f90a521e2e183a7784985dedf6fd867e56436b80` |
| `harness/run-study7b.sh` | U1 (1) | `5f796f5d122f670513249fe6b0ada1b6e839a9f26d2842023883318e7306a0ee` | `c6568db1c9f2be00e651e3222403bfb10e41ad229072952f295457b0493a6544` |
| `harness/run-study7r-counted.sh` | U1 (1) | `2098b83ba316b894ca0327a0c0aabd44db2a1864841dc7f80950cd1722c91fe9` | `506904133ffd3ec01c8c21c6f8ad06b42a3fd6bc29a5ee5dac816e613db9f49b` |
| `harness/run-study7r-pilot.sh` | U1 (1) | `0062480e6c1f0a2b62e0c2842a7e8f4e504240393bf24ebf0707c37601684e63` | `96a721c29ecb18e7ea2dac9ea79fbb2b43664020f06492efea794f9e65bc4bdf` |
| `harness/run-study7r-resume.sh` | U1 (1) | `88a518675a3c09e59a14311544abad9151515a3252e1ecb9eceda39c4fcd98c7` | `b3df0c27e1e51fbf0bb1d413a36e7ef253278d3091f9573b494185de9822817d` |
| `harness/run-study8-claude.sh` | U1 (1) | `25d63553671f5f3aa56701b1cb265e5ff4ad9b4df36b7a7662e0e0f1ad61ee75` | `1403785ca48a9ca0b0918f47fd2375eb3cd7c5e7b2f0eaec05449af18c8a6d3f` |
| `harness/run-study8-resume.sh` | U1 (1) | `01dafa759d817cd3698e21bdb2b369049679627565522bd0e250378185cb14e0` | `cb2505e084f19e9b6d17f65231748de746b2228ba1807e8cfec8284c8eb41e3e` |
| `harness/run-study8.sh` | U1 (1) | `4086cce4ac45903aa729ab1262c766840f46300a2940a69bf8357ac1ccfa8892` | `9cd7b445144bbdb1ab862b7b50141c3e3cbac03d408497b08328c8dd0d93f435` |
| `harness/run-study8n.sh` | U1 (1) | `64e55c80d67ace4acbb1b121e76f4886711028fda59c809b823f58b2766f0a3f` | `51426fe33ca49bae416cb46dd6187c5848679b05d8fd7d2d71c5779b41b5553b` |
| `harness/src/verify-tool.ts` | U1 (1) | `a65fd749f725ae9d67519f67ce697303e63d535e20ca52938d7d11b5ceac829f` | `ed2b207c9ddd65b4e7a979a7a3b5855ffc862b21174ce6200dc952eb8a058493` |
| `results-archive/pilot-study6-live-D0-2026-10-23T07-34-17-274Z.jsonl` | U1 (10), N3 (16) | `dee3cac6baff6aa81651bc5c050e8dc0e6b94ecac4de4c03a79b843ae2dcf634` | `4a31de4278e3fc6f4f9b55c121556bb9ec15c933f23f6014fa1245ea4142f082` |
| `results-archive/pilot-study6-live-D1-2026-10-23T07-44-27-818Z.jsonl` | U1 (10), N3 (19) | `e31086e315b8d610f946b6b891343a413722a740c22acb81f5047cb2ef841776` | `d9ac6608d25cd5738290ebfd18fb8b4b58021de0e4586f20906eab48cc9fc721` |
| `results-archive/pilot-study6-live-W-2026-10-23T07-29-35-167Z.jsonl` | U1 (5), N3 (10) | `1c2c6b85383c1d2abf7e707f0f7afe74f81a29b97618c123fb237062dfccd4f9` | `8d0e8073abb0e19c3f6c03e3611f557d29a96a1998770c580702b411e0248d59` |
| `results-archive/pilot-study7r-live-2026-10-24T08-15-26-359Z.jsonl` | N3 (22) | `699667361c8ecf9f92f19b5165fbf934881cad85e89ad48ac771d13b8bfe43b1` | `e0be2605b07b1b2836667b31175c359e335a8bbf81410ede4a331a8cf142fb86` |
| `results-archive/site-log-2026-10-24T06-15-45-269Z.jsonl` | N1 (50), N2 (50), N3 (807) | `338fb5076296cf79684e737744444ab8b2da0f6a023ec1986394cb86e7e53b6b` | `eee046bc54a19cd332b3983737b09bc4eaa90d2d448c4cb6e73bbb73233f1862` |
| `results-archive/site-log-2026-10-24T11-16-36-041Z.jsonl` | N1 (96), N2 (96), N3 (1118) | `a25a993317cad357aa901210374cc41f959cab49377f03274f592390a77a924d` | `d6cc60429fca416a7c65f7894bc50660dac9d4bae132f61c1bcccb1ee7ad9ad8` |
| `results-archive/study5-2026-10-15T23-55-41-521Z.jsonl` | O1 (2) | `e48ab213ada2e1a5be440bceb2722500bc1fd48b3c405752c6cb70a63f937f99` | `9929d67a47f89d963b650df9b42a205196e85517e4deb02e4abfe6be489f89ed` |
| `results-archive/study6-live-D0-2026-10-23T14-49-23-377Z.jsonl` | U1 (40), N3 (83) | `9ea66dfcdc6f61d631425c118d8658c8e35662d310087bffd9187abd4f9f063a` | `46dc7bbcf24d1c204453c61cbdfe7d9ba1c87c6c2f663452bd5b366a9caaca87` |
| `results-archive/study6-live-D0-2026-10-24T02-04-17-702Z.jsonl` | U1 (110), N3 (188) | `ce4e0fc9e136145d2dfa9e0a508f10668cd98b6a2ecade770e45b570a99cf860` | `94b420c8abf534cb07dad4175fb626c81d38c1051bf5611a0c78bf68da9f0015` |
| `results-archive/study6-live-D1-2026-10-24T03-41-42-992Z.jsonl` | U1 (150), O1 (1), N3 (278) | `085c7005cf8ee58c10dcc2d89777b8378e66aa9095a5dd230d918cefecf9848d` | `3fe3ce4226dad0b9acf54aeebc717343e93bb6da8e7c1bd477e3a4d3096721fc` |
| `results-archive/study6-live-W-2026-10-23T13-51-37-474Z.jsonl` | U1 (75), N3 (139), X1 (1) | `37a4c6bc8903aa09240bf0c4be0c3ea20d571a94afe0f40c3e46a900f2eff958` | `e526fbf434ecff01f28ef6e9269a2aebe862e6bb98f372ef9efb871df821e5ee` |
| `results-archive/study6-live-drift-2026-10-24T06-04-06-857Z.jsonl` | U1 (15), N3 (26) | `3b5a5810092a3f09a6f339a49c01f67f2320c405100bd85ed0479e333f53528b` | `ccb5a9fd445ddddcc1ecc98cc13c3e33ea71e643f1dfc31b61449fe82dac46e8` |
| `results-archive/study7b-console-2026-10-25.log` | U1 (1) | `5bf28259a56d569dc68d28278e2ba2c230c085db346d880846b1df2df5ad2bfa` | `6b79fe9f05f6423e7d8fafc4bd6184b7ebf618788991dc587534c90e3fabf45c` |
| `results-archive/study7b-live-2026-10-25T03-55-54-202Z.jsonl` | N3 (109) | `bca1247f75719824c68f7114ec30af4d49dd2f3b909169da734910b8597f3d3a` | `9e9d1ac54dd5ce0102c9018aaa80d940b5128af4e8b0e896d69f40cf33141600` |
| `results-archive/study7r-counted-console-2026-10-24.log` | U1 (1) | `843075f4f27dc9b067cd594c80fc8152fe30dedca2bba3e4f68da05fc3f905fb` | `5fadce1552a5826988cabf89f06a0888245a3249638cbf9da9da3deb0da78766` |
| `results-archive/study7r-live-2026-10-24T09-36-02-666Z.jsonl` | N3 (120) | `416c5bf56405773e54075ecc74c6c21136fdd1769b48cda6c1f738879801b57f` | `93a9bd26a578f274c6c1a04976c38678dc007e0573ed2595f37688df62aa9a85` |
| `results-archive/study7r-live-2026-10-24T10-29-32-059Z.jsonl` | N3 (125) | `66bed978d33f8e2c4331b919ae18c61151bf0b323c84d5b3c6689bb354f9db0e` | `162c4c31651db054e6f145568b3a29eaa7ef26cbe2917ffa17c670250013a625` |
| `results-archive/study8-console-2026-10-26.log` | U1 (2) | `2ad663b950976876555270aa1e1b42d9291153f03f61e58b6d6ad3c0c3edeeda` | `69e8da6704e83558a3ecf53e9d4ad147be37dba3a861f109b2b7a9dab9d2205a` |
| `results-archive/study8-console-2026-10-29.log` | U1 (3) | `0559f26616933cd70a1befbbf06499df75f2eb8dbd6c68794416067e86d33845` | `22507b10b55d8f60501ba35ff756a602b05311f22d504267b49e37d045c3ddad` |
| `results-archive/study8-live-2026-10-25T23-53-59-448Z.jsonl` | O1 (1), O2 (1), N3 (45) | `16a2f085c965736f3785417e5c36d56362937a85a7f3bb50a1631a483aa3c207` | `c7b63961074fb9b44330038f7612a3f186251dbcec6540e749c9d0d96d6bf97b` |
| `results-archive/study8-live-2026-10-28T22-55-53-305Z.jsonl` | N3 (184) | `7d16b4128598efd201160622a0e8fee557c749d1d19089cf6f63e4ca70e8d406` | `7a97d2f6d8989eef0da6a1f69a88c452be158fc7d06735aafbf96b045ca25032` |
| `results-archive/tool-check-study6-2026-10-23T06-56-53-052Z.json` | N1 (3), N2 (3) | `7186ed8107e1fdebf693c06cffa6d32f4c62f98f72462207b44b2b1bb67200e5` | `bf87829dd175763c65e42e02ea8ffd88f4a5c59c099704a34646bd002c85e98d` |
| `working-notes/HANDOVER.md` | H3 (1) | `837dae43e28249b8e676d0166354702da43ee18a7c46812a94459e5cdad393de` | `f184dd1770e2a22159c5a696a9de7cad48b950fc0dbffe9506050496a3f310ba` |
| `working-notes/RUNBOOK-2026-09-22.md` | H2 (1), H4 (1), H5 (1) | `a0fb564959a746a10c80827899a67c9f10a79c1612f9961ffcb34ff249385628` | `af083675db72257c4747def5119b9e49a8df41a413851b772335f1deb35a7d35` |

## Files moved

These are working notes written during the study. They are kept because other documents refer to them by name, and they were moved out of the top folder so they are not mistaken for results.

- `HANDOVER.md` is now `working-notes/HANDOVER.md`
- `ORCHESTRATOR_HANDOFF.md` is now `working-notes/ORCHESTRATOR_HANDOFF.md`
- `RUNBOOK-2026-09-22.md` is now `working-notes/RUNBOOK-2026-09-22.md`
- `STUDY6-LIVE-PLAN.md` is now `working-notes/STUDY6-LIVE-PLAN.md`

## Files left out

- `README.md`: replaced by the README written for publication
- `STUDY9-DESIGN.md`: design draft of a study that is not registered; its amendment and prediction numbers predate A43
- `WHITEPAPER-SECTION-8-DRAFT.md`: draft of a whitepaper section, superseded by the published whitepaper
- `paper/STUDY-REPORT.md`: three superseded drafts (two whitepaper drafts and a study report draft); the published whitepaper replaces them
- `paper/UGP-WHITEPAPER-V3.md`: three superseded drafts (two whitepaper drafts and a study report draft); the published whitepaper replaces them
- `paper/UGP-WHITEPAPER-draft-0.1-2026-09-04.md`: three superseded drafts (two whitepaper drafts and a study report draft); the published whitepaper replaces them

## Files added

- `README.md`, `REDACTIONS.md`, `working-notes/README.md` and the licence files were written for publication.
- `COMMIT-LOG.txt` lists the short hash, date (UTC) and subject line of each of the 132 commits in the private history, oldest last, passed through the same rules.
- `results-archive/SHA256SUMS.original` is described above.

## Not changed

- The API spend caps and the prepaid account balances they were set from remain in `PREREGISTRATION.md` and in `harness/src/run-study3.ts` and `run-study4.ts`, because the caps are part of the registered plan and of the code that enforced it.
- The results files are published as written at the time. See the README for how to read them.
