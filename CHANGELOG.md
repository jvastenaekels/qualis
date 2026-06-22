# Changelog

## [0.7.4](https://github.com/jvastenaekels/qualis/compare/v0.7.3...v0.7.4) (2026-06-22)


### Bug fixes

* audit Wave E — lifecycle & cross-entity integrity (5 findings) ([#247](https://github.com/jvastenaekels/qualis/issues/247)) ([c2d7f1c](https://github.com/jvastenaekels/qualis/commit/c2d7f1cafdb6cbea7ddc207f27436d157dc7bd34))
* audit Wave F — export hardening (3 findings) ([#249](https://github.com/jvastenaekels/qualis/issues/249)) ([7a93c76](https://github.com/jvastenaekels/qualis/commit/7a93c764faf57d71ba37fc9a1551e83c7e4c3b40))
* audit Wave G — analysis audit-trail & degeneracy warnings (G3, G4) ([#250](https://github.com/jvastenaekels/qualis/issues/250)) ([b53a1c7](https://github.com/jvastenaekels/qualis/commit/b53a1c7f130ad3ea7d4990eb4ad5cf00e1fefc8e))
* audit Wave H — list_studies eager-load + export perf (H1, H3, H4a) ([#258](https://github.com/jvastenaekels/qualis/issues/258)) ([add9d44](https://github.com/jvastenaekels/qualis/commit/add9d442d9f7b81741f68e4ae11a57f2457a8f3a))
* **deps:** resync requirements.txt with uv.lock (unbreak Scalingo build) ([336e66d](https://github.com/jvastenaekels/qualis/commit/336e66d67b04157b0220f30d9838d733faf40c3a))
* **study:** drop Qualis footer on the consent page ([d092a16](https://github.com/jvastenaekels/qualis/commit/d092a16a4af7beaf484ae1f3dae784e760c3aa10))


### Refactor

* audit Wave J — maintainability dedup (J1–J4) ([#260](https://github.com/jvastenaekels/qualis/issues/260)) ([8a7f4c2](https://github.com/jvastenaekels/qualis/commit/8a7f4c2b6376b9159935c4ecc9b132edc4b17056))


### Documentation

* refine contributor acknowledgments wording ([c6f0069](https://github.com/jvastenaekels/qualis/commit/c6f0069980cf48c10a854fcb67dc70931c45a561))

## [0.7.3](https://github.com/jvastenaekels/qualis/compare/v0.7.2...v0.7.3) (2026-06-20)


### Bug fixes

* audit Wave A — security & data-integrity quick wins (4 findings) ([#241](https://github.com/jvastenaekels/qualis/issues/241)) ([f0b3fde](https://github.com/jvastenaekels/qualis/commit/f0b3fdeb01383e097ee397522bc49c08f4fa9037))
* audit Wave B — API error hygiene & info-leak hardening (4 findings) ([#242](https://github.com/jvastenaekels/qualis/issues/242)) ([884c849](https://github.com/jvastenaekels/qualis/commit/884c849100fb3f05176b4d1e31a87702616fc110))
* audit Wave C — participant-flow correctness (4 findings) ([#243](https://github.com/jvastenaekels/qualis/issues/243)) ([27a9652](https://github.com/jvastenaekels/qualis/commit/27a965281b74cda265b7dc5d6a88de68ea2b66aa))
* audit Wave D — admin designer integrity (D1, D2, D4) ([#244](https://github.com/jvastenaekels/qualis/issues/244)) ([57098ed](https://github.com/jvastenaekels/qualis/commit/57098edc0c1c6ac421bcf3b9221d0c8c9e2f2ec2))
* correctness lot — audio atomicity, analysis NaN, races, validation (6 findings) ([#239](https://github.com/jvastenaekels/qualis/issues/239)) ([9d349f2](https://github.com/jvastenaekels/qualis/commit/9d349f2acfbdf1ccefe3ad6bd7093963465709a5))

## [0.7.2](https://github.com/jvastenaekels/qualis/compare/v0.7.1...v0.7.2) (2026-06-20)


### Features

* **demo:** rebrand example study to Bioeconomy Futures with concourse, Q-sorts, and audio ([#232](https://github.com/jvastenaekels/qualis/issues/232)) ([d940a84](https://github.com/jvastenaekels/qualis/commit/d940a84e075144a92293d7880a39c386229bd4a1))


### Bug fixes

* **analysis:** align bootstrap factors to a reference orientation, fixing corrupted per-statement SE/CI from resample sign-flips and factor permutations ([#237](https://github.com/jvastenaekels/qualis/issues/237)) ([1b6f782](https://github.com/jvastenaekels/qualis/commit/1b6f782816ade694128f4c7a8efb76538f88209c))
* **fine-sort:** prevent Q-sort card duplication when a placed card is dropped onto its own slot in a full column ([#237](https://github.com/jvastenaekels/qualis/issues/237)) ([1b6f782](https://github.com/jvastenaekels/qualis/commit/1b6f782816ade694128f4c7a8efb76538f88209c))
* bug-hunt quick wins — admin-logout cross-session data leak, CSV audio-URL 24h TTL, reject zero-duration audio, correct `get_study_full_dump` docstring ([#237](https://github.com/jvastenaekels/qualis/issues/237)) ([1b6f782](https://github.com/jvastenaekels/qualis/commit/1b6f782816ade694128f4c7a8efb76538f88209c))
* **demo:** give the backend healthcheck a start_period so `make demo-up` survives cold starts ([#233](https://github.com/jvastenaekels/qualis/issues/233)) ([e04cafe](https://github.com/jvastenaekels/qualis/commit/e04cafe59efc8ed208b806c90088bf2bc99001e3))
* **deps:** bump starlette to &gt;=1.3.1 for CVE-2026-54282/54283 ([#230](https://github.com/jvastenaekels/qualis/issues/230)) ([91801ba](https://github.com/jvastenaekels/qualis/commit/91801bae72046fef13aa3b8f5a1d75d662b0d099))


### Performance

* avoid double-loading every participant in the research-package export; granular Zustand selectors in the post-sort flow ([#237](https://github.com/jvastenaekels/qualis/issues/237)) ([1b6f782](https://github.com/jvastenaekels/qualis/commit/1b6f782816ade694128f4c7a8efb76538f88209c))
* **demo:** start the backend from the baked venv to cut cold start ~147s to ~6s ([#234](https://github.com/jvastenaekels/qualis/issues/234)) ([b55117d](https://github.com/jvastenaekels/qualis/commit/b55117dd3b0092f76d329e5e6c40d41d2bc13945))


### Refactor

* remove email-OTP 2FA channel, keep TOTP app only (YAGNI) ([#227](https://github.com/jvastenaekels/qualis/issues/227)) ([4d25759](https://github.com/jvastenaekels/qualis/commit/4d257593e76be3ce58449bb7bdceee4552dcf451))
* remove unused project quota feature (YAGNI) ([#226](https://github.com/jvastenaekels/qualis/issues/226)) ([7c97eaf](https://github.com/jvastenaekels/qualis/commit/7c97eaf487c3a460e181cfe59381a266ad9b5488))

## [0.7.1](https://github.com/jvastenaekels/qualis/compare/v0.7.0...v0.7.1) (2026-06-12)


### Features

* **admin:** CapabilityBanner presentational row ([e1bba38](https://github.com/jvastenaekels/qualis/commit/e1bba38eff15d7aaa564362b22a58c0f05c2b00c))
* **admin:** CapabilityBannerStack + collapsed chip ([d9d8a42](https://github.com/jvastenaekels/qualis/commit/d9d8a427820a10ba02b7987ace18d8bbfef76cb5))
* **admin:** contextual email-manual note in Admin &gt; Users ([226b7d3](https://github.com/jvastenaekels/qualis/commit/226b7d350ac24665066ccb423e3d78c1504c21b6))
* **admin:** move superuser platform settings into account menu ([#187](https://github.com/jvastenaekels/qualis/issues/187)) ([02e0b9d](https://github.com/jvastenaekels/qualis/commit/02e0b9d530866f96e8ef5313c6bf578c2b8232e4))
* **admin:** on-demand password-reset link reveal for SMTP-optional mode ([1fd06e5](https://github.com/jvastenaekels/qualis/commit/1fd06e515159f09360c15f18abeb022781df16e3))
* **admin:** replace SMTP banner with CapabilityBannerStack + chip ([ccf8afe](https://github.com/jvastenaekels/qualis/commit/ccf8afe3b0cb5916d94125888a08e09a65a83984))
* **admin:** study-design note when audio storage unavailable ([6322b20](https://github.com/jvastenaekels/qualis/commit/6322b207ffcda17fd26d21e49e1f3224d6d4c0cc))
* **admin:** superuser direct set-email for SMTP-optional mode ([f6390cc](https://github.com/jvastenaekels/qualis/commit/f6390cce738904efe2aaaad8f4386bb806d1ab26))
* **admin:** useCapabilityBanners hook (derive + collapse persistence) ([773838c](https://github.com/jvastenaekels/qualis/commit/773838c2997dd5385a1d2a59090016f3f796f30e))
* **api:** expose audio_storage capability on GET /api/config ([6a57bf1](https://github.com/jvastenaekels/qualis/commit/6a57bf1c7c6381f89fcac4ab2435ff2992d3e6da))
* **audio:** 503 safety-net when object storage is unconfigured ([20546b0](https://github.com/jvastenaekels/qualis/commit/20546b0d2a5cbb2cb20121627b4bd7d174286d05))
* **auth:** clear 503 for legacy email-2FA login when SMTP manual ([b971abb](https://github.com/jvastenaekels/qualis/commit/b971abb522d0a1e01f88b589ecce240dc361937f))
* **auth:** reject email-2FA enrolment when SMTP unconfigured ([fcac806](https://github.com/jvastenaekels/qualis/commit/fcac806829cb00ef22b7bbe011c6fb3727868f88))
* **config:** expose email_delivery capability via GET /api/config ([9edea19](https://github.com/jvastenaekels/qualis/commit/9edea1932ef531d1ff909739e17b9e2667332541))
* **config:** is_s3_configured capability flag ([f29a55f](https://github.com/jvastenaekels/qualis/commit/f29a55ff11831f5c16429f928201c02309506587))
* **frontend:** admin banner when email delivery is manual ([e000a10](https://github.com/jvastenaekels/qualis/commit/e000a1097f780749c36f8fc5b2e461f680fe45fe))
* **frontend:** forgot-password copy adapts to email-manual mode ([2c27816](https://github.com/jvastenaekels/qualis/commit/2c27816a78c2900364d98f37a1c83c651014fca8))
* **frontend:** generate + reveal password-reset link from Admin &gt; Users ([a575f3a](https://github.com/jvastenaekels/qualis/commit/a575f3add4e2faadf03a84e4dee476a8b6c0c47d))
* **frontend:** hide email-2FA channel when SMTP unconfigured ([b18db6c](https://github.com/jvastenaekels/qualis/commit/b18db6cee5fe47b3398bef5c7d824871c321cf25))
* **frontend:** platform-config store + GET /api/config bootstrap ([4f6f619](https://github.com/jvastenaekels/qualis/commit/4f6f619d42de7237b92de046618a62e70c178640))
* **frontend:** platform-config store carries audio_storage ([1d8adff](https://github.com/jvastenaekels/qualis/commit/1d8adff2b55d84a2fb05e8f36e29764f86097bf0))
* **frontend:** wire superuser set-email UI; close email-change in-product gap ([a99dd31](https://github.com/jvastenaekels/qualis/commit/a99dd31307d3dab339b9ebf3b758f3aec1c3b59b))
* **i18n:** capability-banner strings (professional register) ([22d4286](https://github.com/jvastenaekels/qualis/commit/22d42864c90af699f5dd47a55c71871a141bfb22))
* **participant:** audio degrades to text-only when storage absent ([fe23fef](https://github.com/jvastenaekels/qualis/commit/fe23fef907da11a1fd8a6d21024eb84fe45c51d0))
* SMTP-optional mode — fully usable without email ([6971302](https://github.com/jvastenaekels/qualis/commit/6971302caa0ec44fbcfe9a351a674dcf51d70f3f))
* **spa:** serve repo docs/ statically at /docs ([3a45326](https://github.com/jvastenaekels/qualis/commit/3a45326c50901b4071e861072532f534858ea78b))
* **startup:** log email-optional capability banner when SMTP absent ([59b38f4](https://github.com/jvastenaekels/qualis/commit/59b38f4f7334372f0fe24278d4aefe98b8da799c))
* **startup:** log storage-optional banner when S3 absent ([0935926](https://github.com/jvastenaekels/qualis/commit/0935926f4fef966d18a2fcc82e477517fdd4ac43))


### Bug fixes

* **deps:** pin mando&lt;0.8 to resolve radon conflict breaking Scalingo deploy ([#203](https://github.com/jvastenaekels/qualis/issues/203)) ([af65271](https://github.com/jvastenaekels/qualis/commit/af652717aab5aa1130e31fe7d576898af459a32f))
* submission-readiness fixes (slugs, validation, docs) ([#211](https://github.com/jvastenaekels/qualis/issues/211)) ([100c467](https://github.com/jvastenaekels/qualis/commit/100c46720853a5acb0b43e96d8f721699aa45c26))
* **spa:** unify stale-chunk recovery; stop silent post-deploy freeze ([6f07495](https://github.com/jvastenaekels/qualis/commit/6f0749550b51c34ebd9d62e540b5a338b18e4362))
* surface centroid non-convergence + document reliability/bootstrap assumptions (F-06-010, F-06-004) ([#214](https://github.com/jvastenaekels/qualis/issues/214)) ([6f08f40](https://github.com/jvastenaekels/qualis/commit/6f08f40294383575bfad8e16b410c17800646cea))
* **test:** configure S3 for audio security suites under the new guard ([9b79ba5](https://github.com/jvastenaekels/qualis/commit/9b79ba5cff737dc49c11c26c146bce0f0bf01f8b))


### Refactor

* **admin:** align study-design audio note to professional register ([ad5ca91](https://github.com/jvastenaekels/qualis/commit/ad5ca917e2c077462238f3ea2ea95242ca16f3df))
* **admin:** remove global capability-banner chrome ([507185c](https://github.com/jvastenaekels/qualis/commit/507185c38c6840474d6e33a54146d935f54ca0ee))
* **designer:** QSortEditor W3b — adopt helpers + dnd-kit, slim test ([f241b7a](https://github.com/jvastenaekels/qualis/commit/f241b7a9f306262e5baf2a25dfadbbbdec3474c7))
* **startup:** align SMTP/S3 banner first lines (professional register) ([dd1e182](https://github.com/jvastenaekels/qualis/commit/dd1e1826eb58085a8acb3d0306342752d5a77208))


### Documentation

* align project framing and resync doc/code accuracy ([#209](https://github.com/jvastenaekels/qualis/issues/209)) ([dff4e57](https://github.com/jvastenaekels/qualis/commit/dff4e57b4c63820b7b571b7fe9e6df906f10ddea))
* **guides:** running Qualis without SMTP — capability matrix ([04da211](https://github.com/jvastenaekels/qualis/commit/04da211bf74ac917fa6e5bee298fb1eb271909b5))
* **guides:** running without S3 / object storage ([ec1266b](https://github.com/jvastenaekels/qualis/commit/ec1266b35380c3fe6d773dc62b15cd6f9204e1d6))
* last-superuser shell escape; audit docstring PII carve-out. ([a99dd31](https://github.com/jvastenaekels/qualis/commit/a99dd31307d3dab339b9ebf3b758f3aec1c3b59b))
* name commercial integrated Q tools in comparison; re-scope novelty (P5) ([#213](https://github.com/jvastenaekels/qualis/issues/213)) ([5e2eba9](https://github.com/jvastenaekels/qualis/commit/5e2eba948d85566de9d16d26b05be917b548718d))
* note that make demo-up builds from source; no hosted instance (P7) ([#215](https://github.com/jvastenaekels/qualis/issues/215)) ([c0b6f6b](https://github.com/jvastenaekels/qualis/commit/c0b6f6b27d40ce8f7b0a6d2d5192d56fa5ee7c73))
* **plan:** capability-banners implementation plan (9 tasks, TDD) ([6d1e39b](https://github.com/jvastenaekels/qualis/commit/6d1e39b1eac98c4edbbc445fffccac649bf231fa))
* **plan:** contextual-only capability warnings (3 tasks, TDD) ([5ece091](https://github.com/jvastenaekels/qualis/commit/5ece0915c69a9ba8d12dc904c7fd600ea7bca325))
* **plan:** S3-optional mode implementation plan (10 tasks, TDD) ([05a96e0](https://github.com/jvastenaekels/qualis/commit/05a96e08c3de5d95a31f791b4734b18f20c949fc))
* **plan:** SMTP-optional mode implementation plan ([5f15e9a](https://github.com/jvastenaekels/qualis/commit/5f15e9a90d54b29aa64b9a631a825001539417df))
* **readme:** remove screenshots ([345db00](https://github.com/jvastenaekels/qualis/commit/345db00b0b1acb44c9dc7df00f67f7e0152cdf41))
* **readme:** replace screenshots with curated app captures ([#202](https://github.com/jvastenaekels/qualis/issues/202)) ([6da6a24](https://github.com/jvastenaekels/qualis/commit/6da6a24e4285de20c200204ec43fd4aac00961f5))
* **spec:** capability-banners clarity & behaviour redesign ([f81b87d](https://github.com/jvastenaekels/qualis/commit/f81b87dce7212b53043fbf16ee5abb32fec3373c))
* **spec:** contextual-only capability warnings (remove global banner) ([e06f381](https://github.com/jvastenaekels/qualis/commit/e06f381a07127a62236ca0b8292561bcdb2b59d1))
* **spec:** pin docs static-serve mechanism (backend /docs mount) ([7df6ad9](https://github.com/jvastenaekels/qualis/commit/7df6ad9524c72c99433b9284a7ddd1d49580a414))
* **spec:** S3-optional mode design ([7973bc2](https://github.com/jvastenaekels/qualis/commit/7973bc27d263d47c10ae0fbc0d2cd6db7f8e44c1))
* **spec:** SMTP-optional mode design ([6c10618](https://github.com/jvastenaekels/qualis/commit/6c10618a44fb3ac34b702c47f78ae41cf08c9867))
* **test:** warn future authors the S3 autouse fixture masks the 503 path ([66268ab](https://github.com/jvastenaekels/qualis/commit/66268abec0de8c669cab090fa065c3a94885882b))

## [0.7.0](https://github.com/jvastenaekels/qualis/compare/v0.6.8...v0.7.0) (2026-05-17)


### Bug fixes

* **admin:** /app/users showed no users + harden flaky backend tests ([#186](https://github.com/jvastenaekels/qualis/issues/186)) ([97beab2](https://github.com/jvastenaekels/qualis/commit/97beab254590a8ca5cdabcf977b7266b66ea2b3d))
* **designer:** presortFields must not leak the {enabled} wrapper as a field map ([#185](https://github.com/jvastenaekels/qualis/issues/185)) ([375a4bc](https://github.com/jvastenaekels/qualis/commit/375a4bc21e26bfb2cec5b549ab5c8c7c2925a8d1))


### Refactor

* **admin:** extract useInteractiveDataView (code-quality wave 1) ([#176](https://github.com/jvastenaekels/qualis/issues/176)) ([1235b45](https://github.com/jvastenaekels/qualis/commit/1235b459f907e8dfa55f2034308ae2c965ed3533))
* **audio:** extract useAudioRecorder — code-quality wave 3 ([#179](https://github.com/jvastenaekels/qualis/issues/179)) ([a2fd882](https://github.com/jvastenaekels/qualis/commit/a2fd8827d0b36992ff694dbc4130179d50d1b5e2))
* **audio:** fold useAudioRecorder ui-coupling (W3 follow-up) ([#184](https://github.com/jvastenaekels/qualis/issues/184)) ([fd36db2](https://github.com/jvastenaekels/qualis/commit/fd36db216a53dd6309acf1a4614835304294e506))
* **designer:** extract useQSortEditor — code-quality wave 4 ([#183](https://github.com/jvastenaekels/qualis/issues/183)) ([3c5cd7c](https://github.com/jvastenaekels/qualis/commit/3c5cd7cae8d25893230b3140e4a4bbef78042a15))
* **types:** adopt StudyConfig types — code-quality wave 2 ([#178](https://github.com/jvastenaekels/qualis/issues/178)) ([ea033f6](https://github.com/jvastenaekels/qualis/commit/ea033f6d5162fe7a2d359464dd099ca45c228014))


### Chore

* release 0.7.0 ([5230f9a](https://github.com/jvastenaekels/qualis/commit/5230f9a16fd2a555b293ae6343a144b6bd77d5ec))

## [0.6.8](https://github.com/jvastenaekels/qualis/compare/v0.6.7...v0.6.8) (2026-05-15)


### Features

* **demo:** add Lipset (1963) published dataset as validation example ([b4d24a9](https://github.com/jvastenaekels/qualis/commit/b4d24a9772ef0af7a47df488ea8b49bbda00d6f0))
* **demo:** make demo-seed produce a submission-ready (active) study ([02eeef9](https://github.com/jvastenaekels/qualis/commit/02eeef9a261957e46adcc346fc946dc668d23bb6))
* **demo:** seed post-sort questionnaire + explicit rough-sort ([d672fe4](https://github.com/jvastenaekels/qualis/commit/d672fe46b24f70c091e614d0808495cb270936c9))
* **memo:** add AdminService memo export download helpers ([934a046](https://github.com/jvastenaekels/qualis/commit/934a046aefa33070e8bda335ddb7d20fb305a885))
* **memo:** add concourse/study memo Markdown export endpoints ([08180f1](https://github.com/jvastenaekels/qualis/commit/08180f1d627f0c7ab0919e02da182d06e38eb0c2))
* **memo:** add MemoService.render_markdown audit-trail renderer ([ad71aca](https://github.com/jvastenaekels/qualis/commit/ad71acac8b8698d4043cff53da7af8493a385145))
* **memo:** Markdown export for concourse/study memos ([23ed6fa](https://github.com/jvastenaekels/qualis/commit/23ed6fa2582bee1bdc063125ecb2839c8969c654))
* **memo:** wire memo export button + hook handler ([132eacd](https://github.com/jvastenaekels/qualis/commit/132eacdeb46e8798bbb263db2a13eaaf844c5ff2))
* superuser-only /app/users admin page + account-management endpoints ([#171](https://github.com/jvastenaekels/qualis/issues/171)) ([bb51c88](https://github.com/jvastenaekels/qualis/commit/bb51c8800c5ba3d27afb37f9c585fe6f4355873a))


### Documentation

* **citation:** cite concept DOI; keep v0.6.7 archive as identifier ([44ddc61](https://github.com/jvastenaekels/qualis/commit/44ddc61fc0e62b351ae910c05f0fba970679b302))
* **citation:** wire Zenodo v0.6.7 DOI; drop "critical Q" positioning ([3cff48a](https://github.com/jvastenaekels/qualis/commit/3cff48acb7db81b04f5a68610e2879559bdc5d93))
* **memo:** add export spec + implementation plan ([4dc3dbe](https://github.com/jvastenaekels/qualis/commit/4dc3dbec91318842a52815d60cfda483edeaa96a))
* **readme:** point DOI badge at concept DOI (always-latest) ([f65b873](https://github.com/jvastenaekels/qualis/commit/f65b8730464c45f13cccef76d4637e680f996a77))

## [0.6.7](https://github.com/jvastenaekels/qualis/compare/v0.6.6...v0.6.7) (2026-05-15)


### Features

* **i18n:** add Polish locale (participant + admin) ([#169](https://github.com/jvastenaekels/qualis/issues/169)) ([c7e731e](https://github.com/jvastenaekels/qualis/commit/c7e731eb1323d32d06be72b30e7f0703dd612774))
* **i18n:** add Portuguese locale (participant + admin) ([#167](https://github.com/jvastenaekels/qualis/issues/167)) ([29a7582](https://github.com/jvastenaekels/qualis/commit/29a758234bcf50a07f5b18e36cd7f03f058ccd65))


### Bug fixes

* **i18n:** rework German locale with glossary-driven retranslation ([#165](https://github.com/jvastenaekels/qualis/issues/165)) ([c2fa139](https://github.com/jvastenaekels/qualis/commit/c2fa1394c580520a8a275adc993b8b41e8478be0))


### Documentation

* sync i18n references with current locale architecture ([#168](https://github.com/jvastenaekels/qualis/issues/168)) ([b62c138](https://github.com/jvastenaekels/qualis/commit/b62c1389fe7c3d73063c40831fb64f1d3c74b881))

## [0.6.6](https://github.com/jvastenaekels/qualis/compare/v0.6.5...v0.6.6) (2026-05-14)


### Features

* **i18n:** add Dutch locale (participant + admin) ([#163](https://github.com/jvastenaekels/qualis/issues/163)) ([4f1e438](https://github.com/jvastenaekels/qualis/commit/4f1e43845bf96a5acb06f0a970bbed9dd49f347a))

## [0.6.5](https://github.com/jvastenaekels/qualis/compare/v0.6.4...v0.6.5) (2026-05-14)


### Features

* **i18n:** add German locale ([5c202da](https://github.com/jvastenaekels/qualis/commit/5c202da7e9993a55fc04bb446b2281d352e3d6fa))
* **i18n:** add Italian locale (participant + admin) ([#162](https://github.com/jvastenaekels/qualis/issues/162)) ([41cb4e9](https://github.com/jvastenaekels/qualis/commit/41cb4e97245717466bdf8aa3c149ab331a7e82c7))
* **i18n:** add Spanish locale (participant + admin) ([#161](https://github.com/jvastenaekels/qualis/issues/161)) ([12b66fa](https://github.com/jvastenaekels/qualis/commit/12b66fabb310a16b25185d7051e439c8c3a2fc0b))
* **i18n:** differentiated parity policy (admin best-effort) ([#159](https://github.com/jvastenaekels/qualis/issues/159)) ([26470c6](https://github.com/jvastenaekels/qualis/commit/26470c68668f0ed97b342fe4c58359a2772c0bcd))
* **i18n:** tooling for adding new locales ([#157](https://github.com/jvastenaekels/qualis/issues/157)) ([41e1ff7](https://github.com/jvastenaekels/qualis/commit/41e1ff7ead3a5b232106287fd3d10595e62dec07))


### Bug fixes

* **analysis:** harden factor scoring edge cases ([d4e218f](https://github.com/jvastenaekels/qualis/commit/d4e218fcf5d4ac4a0d6a619aa810a5dcb210a2bd))
* **frontend:** refresh fast-uri transitive audit floor ([0a3c61b](https://github.com/jvastenaekels/qualis/commit/0a3c61b5d292aedcd4f83e00f2398668dc864edb))


### Refactor

* **audio:** reduce recorder cleanup complexity ([190e790](https://github.com/jvastenaekels/qualis/commit/190e790ead3b4b54d59989950b2fc79aa6545deb))
* **i18n:** split locales into participant + admin namespaces ([#158](https://github.com/jvastenaekels/qualis/issues/158)) ([5ddc53e](https://github.com/jvastenaekels/qualis/commit/5ddc53ebfa6545d10f22c362f68d38857ad892c9))


### Documentation

* add ci warnings fix plan ([68bafcb](https://github.com/jvastenaekels/qualis/commit/68bafcbe172b79955cf745f3951c2e424dc55922))
* fix documentation inconsistencies ([#156](https://github.com/jvastenaekels/qualis/issues/156)) ([2c5caa1](https://github.com/jvastenaekels/qualis/commit/2c5caa19142c20971457c8aaf6b106477b67f1c5))
* **i18n:** align languages plan + runbook with namespace split ([#160](https://github.com/jvastenaekels/qualis/issues/160)) ([c2eadbd](https://github.com/jvastenaekels/qualis/commit/c2eadbdfb0bcf0667f3e564eb12f83855a29d6f6))

## [0.6.4](https://github.com/jvastenaekels/qualis/compare/v0.6.3...v0.6.4) (2026-05-12)


### Documentation

* avoid overclaiming concurrent editing ([e242124](https://github.com/jvastenaekels/qualis/commit/e242124205cf85826aba9f5633eed16bab0f3a47))
* qualify browser support claims ([048c966](https://github.com/jvastenaekels/qualis/commit/048c966c8ebe94a6d8a7e25f974453ba26ce5528))

## [0.6.3](https://github.com/jvastenaekels/qualis/compare/v0.6.2...v0.6.3) (2026-05-04)


### Features

* **questions:** add rating-N scale question type for pre/post-sort ([#150](https://github.com/jvastenaekels/qualis/issues/150)) ([ed89d25](https://github.com/jvastenaekels/qualis/commit/ed89d25f25aa463cb4fd7fb5065352cab61bcc47))

## [0.6.2](https://github.com/jvastenaekels/qualis/compare/v0.6.1...v0.6.2) (2026-05-04)


### Features

* **footer:** Footer component with attribution, license, GitHub link ([6b811d4](https://github.com/jvastenaekels/qualis/commit/6b811d47956a5d56ae909d1dd749499716bf17ae))
* **footer:** mount global Footer in AdminLayout ([977778f](https://github.com/jvastenaekels/qualis/commit/977778f045a701382ae4f6d40ecba499cfc01d4e))
* **footer:** mount global Footer in StudyLayout, hidden on Q-sort screens ([fb6f9f7](https://github.com/jvastenaekels/qualis/commit/fb6f9f794e5c1af9c28f95ec2bda938eeabe34b7))
* **footer:** wrap standalone routes with PublicPageLayout ([1728a7c](https://github.com/jvastenaekels/qualis/commit/1728a7cea08500bfbc8ac4111c0f7da7313ae062))
* **layouts:** PublicPageLayout wrapper mounts global Footer ([f33e1e4](https://github.com/jvastenaekels/qualis/commit/f33e1e457112ee2aee82dbd863d2b53d80c4c4a5))
* **roles:** add MAX_MEMBERS_PER_PROJECT and MAX_PROJECTS_AS_OWNER settings ([493033a](https://github.com/jvastenaekels/qualis/commit/493033a37123f66201a1b21431978e048403e721))
* **roles:** add quotas service for project membership and ownership ([2ff2c25](https://github.com/jvastenaekels/qualis/commit/2ff2c255f1b166238a35914270cb48b4a9671e22))
* **roles:** enforce member and owner-project quotas at endpoints ([919464f](https://github.com/jvastenaekels/qualis/commit/919464f4f16bcb460c3e8fd06af8efb0b11548ec))
* **roles:** expose member_quota and owned_project_quota in API ([1aa7ff8](https://github.com/jvastenaekels/qualis/commit/1aa7ff8813ab8456e119aeedf77b961496a4084a))
* **roles:** map backend error codes to translated toasts ([99ce29c](https://github.com/jvastenaekels/qualis/commit/99ce29c9750b1cfebb5538fccb90302acf21de42))
* **roles:** reject role=owner in PATCH and invitation endpoints ([f4f5f7b](https://github.com/jvastenaekels/qualis/commit/f4f5f7bcb292f2f603d883a8dc890d4ad73e22fa))
* **roles:** rename usePermission researcher→member, add hook tests ([1e9b452](https://github.com/jvastenaekels/qualis/commit/1e9b452a44b17eed8e7f266710002a4c8575fc30))
* **roles:** show member quota and disable Invite at limit ([16a67c7](https://github.com/jvastenaekels/qualis/commit/16a67c72533542261343400fceaf799c72000bf4))
* **roles:** show owned-project quota and disable Create at limit ([3890069](https://github.com/jvastenaekels/qualis/commit/3890069fd97bcdb81498e430c45594fd739e50e3))


### Bug fixes

* **ci:** bump semgrep to 1.150.0 to drop pkg_resources dependency ([81e7813](https://github.com/jvastenaekels/qualis/commit/81e78138085e5a879a4176cf8ef7840772d127fa))
* **ci:** unblock Wave 6 CI failures (deptry + semgrep) ([f71112f](https://github.com/jvastenaekels/qualis/commit/f71112f7d4def89f93a64855f6acb02e652e4e38))
* **dashboard:** drop unused SurveyAnswerGroup export (W2) ([f8f72c8](https://github.com/jvastenaekels/qualis/commit/f8f72c8db5fff7439f78fb26a95c0eea660ec713))
* **dashboard:** remove dead SurveyAnswerGroup interface (W2) ([6cf3e2f](https://github.com/jvastenaekels/qualis/commit/6cf3e2f3f6227715fd696a2fe1e463b9ff2db5c6))
* **dashboard:** remove dead SurveyAnswerItem interface (W2) ([49a1047](https://github.com/jvastenaekels/qualis/commit/49a1047ba2fedc7ce0cb12c9ee57ec4636a20dd9))
* **dashboard:** restore active → draft transition in StudyStatusControl (W2) ([ae1cde7](https://github.com/jvastenaekels/qualis/commit/ae1cde77c0e2c529cd6274eac9513a3308b9b79c))
* **deps:** bump pygments to 2.20.0 to patch CVE-2026-4539 ([b85e5c8](https://github.com/jvastenaekels/qualis/commit/b85e5c89b48cce4acbc89e5de911b9fe544c57d1))
* **deps:** bump python-dotenv to 1.2.2 to patch CVE-2026-28684 ([5f9a58f](https://github.com/jvastenaekels/qualis/commit/5f9a58fa0f9bde473c5de000051a0092329d6122))
* **deps:** bump requests to 2.33.1 to patch CVE-2026-25645 ([5b06f3e](https://github.com/jvastenaekels/qualis/commit/5b06f3ea56979054941373afccf4e4fb7c226b51))
* **footer:** single centered row, drop GitHub icon, AGPLv3 visible on mobile ([fa04161](https://github.com/jvastenaekels/qualis/commit/fa0416114d8569d7234d2eccb44e02ff9ca741ee))
* **footer:** single centered row, drop GitHub icon, AGPLv3 visible on mobile ([26061d4](https://github.com/jvastenaekels/qualis/commit/26061d4265763296dfd48e0945ce32e78335382f))
* **layouts:** use flex-1 on PublicPageLayout-wrapped pages so Footer fits ([18958dd](https://github.com/jvastenaekels/qualis/commit/18958dd688c60521f6615324c909c91ea415139c))
* **mutator:** contextualize and translate Access Denied / 4xx toasts ([cd4598c](https://github.com/jvastenaekels/qualis/commit/cd4598ca87edf275a07a5f2904a26bd40d8fe142))
* **mutator:** contextualize and translate Access Denied / 4xx toasts ([0a48cbc](https://github.com/jvastenaekels/qualis/commit/0a48cbc6a5c4dc105061525da547166fe5fcc0f3))
* **security:** address Wave 2 PR [#110](https://github.com/jvastenaekels/qualis/issues/110) review feedback ([6a3a87a](https://github.com/jvastenaekels/qualis/commit/6a3a87aa047374419ecd37dfd79badc40b58ebc2))
* **security:** close email-enumeration timing leaks on auth-email endpoints ([f76d0ad](https://github.com/jvastenaekels/qualis/commit/f76d0adae74be5f50e45f5e978a1c7e419e94c27))
* **security:** F-03-010 invalidate access tokens on password change ([94d3387](https://github.com/jvastenaekels/qualis/commit/94d338704c560139296d5bbae8470604e001fec8))
* **security:** F-03-011 add email-change dual-confirmation flow ([3fb51da](https://github.com/jvastenaekels/qualis/commit/3fb51da87b26008a1435ad0fff58eb27b5995988))
* **security:** F-03-012 add clock-skew leeway to JWT decode paths ([d605e77](https://github.com/jvastenaekels/qualis/commit/d605e770157519e48a100304a2972f0cba2741a2))
* **security:** F-03-013 broaden log-scrub regex + cover application loggers ([c0064ec](https://github.com/jvastenaekels/qualis/commit/c0064ecf09dd785f0b7731abc70a3d962665b1d5))
* **study-layout:** unpin global footer from viewport bottom ([2fd557f](https://github.com/jvastenaekels/qualis/commit/2fd557f2045cbb4d2fc56236fc89d0e463721d95))
* **study-layout:** unpin global footer from viewport bottom ([6d8dcf5](https://github.com/jvastenaekels/qualis/commit/6d8dcf57f851e266644b27277557160826d1051b))
* **viewer:** hide create-study CTAs and stop concourse auto-create for viewers ([519a6cb](https://github.com/jvastenaekels/qualis/commit/519a6cbeba7e7e07f2173eca769759c2e056fbf8))
* **viewer:** hide create-study CTAs and stop concourse auto-create for viewers ([21d4580](https://github.com/jvastenaekels/qualis/commit/21d4580e77e445c22c0b8e6a8ad135569f11a5aa))


### Refactor

* **account:** finalize Profile → Account settings, add 2FA channel selector ([1084817](https://github.com/jvastenaekels/qualis/commit/10848178d5f7ef0cd787528187e9f0b3d771a0d9))
* **analysis:** extract sort + type-label helpers from StatementsTable (W2) ([4c0fcb1](https://github.com/jvastenaekels/qualis/commit/4c0fcb119a86c5eb8102926aceb39d8f9c56c027))
* **analysis:** extract sort helper + LoadingCell from FactorLoadingsTable (W2) ([a633d3c](https://github.com/jvastenaekels/qualis/commit/a633d3cd4a76201e0ace0e6fdfea2129ac0c00b4))
* **api:** split handleErrorStatus into per-status handlers (W1) ([e64b609](https://github.com/jvastenaekels/qualis/commit/e64b6090f33f38eeeff13142db9f61e96363b929))
* **ci-warnings:** W2 — reduce cognitive complexity in analysis/dashboard tables ([6b9a856](https://github.com/jvastenaekels/qualis/commit/6b9a8561a8cac3c575056e6a0572913e1f4bfc28))
* **ci-warnings:** W2-T5 reduce complexity in SurveyResponseTable ([a857d86](https://github.com/jvastenaekels/qualis/commit/a857d861603d9ebc4792c9b74e864190da175641))
* **ci-warnings:** W2-T6 suppress P5 complexity in ParticipantMetadataCard ([ca18ac5](https://github.com/jvastenaekels/qualis/commit/ca18ac5fca1b08f9f155b1a5153fc79817024a1d))
* **ci-warnings:** W2-T7 reduce complexity in StudyStatusControl ([017e3ba](https://github.com/jvastenaekels/qualis/commit/017e3ba0021539b49d0949e02665e6f5476e0a31))
* **ci-warnings:** W2-T8 reduce complexity in QuestionDistributionCharts ([6c9882b](https://github.com/jvastenaekels/qualis/commit/6c9882b170c349a9274e021e4bb78fbb4e4461d6))
* **concourse:** extract diffVersionFields from ItemDetailSheet (W2) ([e894b04](https://github.com/jvastenaekels/qualis/commit/e894b04c25978c8dc7ff787ac8c9ee082a6c04a3))
* **dashboard:** extract filter helpers + ParticipantCell + buildColumns from InteractiveDataView (W2) ([8ee0a72](https://github.com/jvastenaekels/qualis/commit/8ee0a7230d9954814f4022c60f47cac1dcfd7803))
* **designer:** extract applyCapacityDelta from QSortEditor (W3b) ([7a08ea6](https://github.com/jvastenaekels/qualis/commit/7a08ea6a2deb8aeb4a33d63c663e9bc928c4f2e7))
* **designer:** extract applyLanguageRestore/Init from LanguageManagerModal (W3a) ([d2d1d66](https://github.com/jvastenaekels/qualis/commit/d2d1d66f7fde9edca3bd240727e9581a4ec90842))
* **designer:** extract buildOtherTranslations from MultiLangFieldIcon (W3a) ([89ed172](https://github.com/jvastenaekels/qualis/commit/89ed1726d505f2409246ead91e79321e325a58c2))
* **designer:** extract computeAutoShapedCapacities from QSortEditor (W3b) ([81a7118](https://github.com/jvastenaekels/qualis/commit/81a71185cac47e575e01c81c6830e9992c056ef6))
* **designer:** extract copyMultilangField/copyOptions from QuestionBuilder (W3a) ([801c71b](https://github.com/jvastenaekels/qualis/commit/801c71b4d80ebf7cbc9fddfde226616128817392))
* **designer:** extract mergeParsedItemIntoStatements from QSortEditor (W3b) ([a8d12ef](https://github.com/jvastenaekels/qualis/commit/a8d12ef5426f24b98430f8e4ec8d34630431061e))
* **designer:** suppress 7 P5 sites in QuestionBuilder + PostSortConfigEditor (W3c) ([1b1b70a](https://github.com/jvastenaekels/qualis/commit/1b1b70a6e341029b2ff376adbc46ca9f57814820))
* **designer:** suppress P5 ProcessStepEditor:289 with rationale (W3a) ([5f22f7a](https://github.com/jvastenaekels/qualis/commit/5f22f7afe02132c8b4e38ac8715d5c5b63417573))
* **designer:** suppress P5 QSortEditor shells + split auto-shape loop (W3b) ([68a27c3](https://github.com/jvastenaekels/qualis/commit/68a27c361c9e122d729c9de2c60cba4afe938526))
* **footer:** remove inline attribution from StudyAccessGate ([43720cf](https://github.com/jvastenaekels/qualis/commit/43720cfc12dd661c86d3715eb35f91065ff0c9a0))
* **hooks:** extract buildAccessRulesUpdate helper (W1) ([2950c89](https://github.com/jvastenaekels/qualis/commit/2950c896614ce2f1c43d061997de877264fbfb6e))
* **hooks:** extract computeAutoFitTransform from useGridZoom (W1) ([452017f](https://github.com/jvastenaekels/qualis/commit/452017fa0dae5fc1c7a019ca3a0375c66f58b235))
* **hooks:** extract computeCardDimensions from useGridCalculations (W1) ([3c94223](https://github.com/jvastenaekels/qualis/commit/3c94223547a1255ac61e3bb73c66fd352d2e8985))
* **hooks:** extract isDraftInSync from useStudyPersistence (W1) ([9e001e7](https://github.com/jvastenaekels/qualis/commit/9e001e7944be467c0bff93f51ed809645f5233f3))
* **hooks:** extract pan computations from useDragAutoInteraction (W1) ([d00a8cf](https://github.com/jvastenaekels/qualis/commit/d00a8cfb7b23728a63f850ec7a1d5cd84b83e1b1))
* **hooks:** extract resolveDropTarget from useFineSortDrag (W1) ([a0491ad](https://github.com/jvastenaekels/qualis/commit/a0491ad901860564606d0fcdd01e390baaae8103))
* **hooks:** extract resolveServerConflict from useStudyPersistence (W1) ([3218ef3](https://github.com/jvastenaekels/qualis/commit/3218ef3c41ff59639ae983d4f0ce8f1a9be6a6e8))
* **layouts/pages:** W5 — 5 P3 extractions + 3 P5 page-shell suppressions ([06c9d0a](https://github.com/jvastenaekels/qualis/commit/06c9d0aa4110c21466715de97e455c88bd3b2a43))
* **participant:** apply 12 P5 suppressions in participant runtime (W4b) ([2d0ed01](https://github.com/jvastenaekels/qualis/commit/2d0ed0102874e5d72b52a43018f237782b7df8cd))
* **participant:** extract resolveNextSlot + selectExtremeCards (W4a) ([3c1522c](https://github.com/jvastenaekels/qualis/commit/3c1522c8c2411b234c347d4e77aeb6651873a507))
* reduce cognitive complexity — Wave 1 utilities & hooks ([ec2c8ec](https://github.com/jvastenaekels/qualis/commit/ec2c8ecbc7b548e98bce1cf1111b4cb741b9c212))
* **roles:** purge legacy 'researcher' and 'admin' role literals ([ec12501](https://github.com/jvastenaekels/qualis/commit/ec1250147356b35053f2943eec4d8275846e2de5))
* **roles:** rename project role 'researcher' to 'member' ([8591e7b](https://github.com/jvastenaekels/qualis/commit/8591e7baa27fa8d51ce4067c7a65dbfd81abe7db))
* **utils:** extract applyDefaultsToTranslations from reset handler (W1) ([50ac018](https://github.com/jvastenaekels/qualis/commit/50ac018cfe2f7eb90c6de3927487106c3ecba6c6))
* **utils:** extract findBestMatchForFactor from matchFactorsByPhi (W1) ([6287957](https://github.com/jvastenaekels/qualis/commit/62879579705760a57f2ff134e56d89fdd12e250e))
* **utils:** split parseUA into per-axis detectors (W1) ([572b651](https://github.com/jvastenaekels/qualis/commit/572b6514d21aa2e3274aab928b5f0aecc5b0d280))
* W3a — designer micro-utilities (cognitive complexity) ([c48eb1f](https://github.com/jvastenaekels/qualis/commit/c48eb1fbd03e31f6fb21cbd21aa29fe08b99ac15))
* W3b — QSortEditor algorithmic core (cognitive complexity) ([ef674ec](https://github.com/jvastenaekels/qualis/commit/ef674ec06cec0ee9a8e447c8549e70e01804c998))
* W3c — designer JSX shell suppressions (cognitive complexity) ([3be896d](https://github.com/jvastenaekels/qualis/commit/3be896dcfc8ae25c26dac6059ec6f07f95149320))
* W4a — participant runtime helper extractions (cognitive complexity) ([e5c1adc](https://github.com/jvastenaekels/qualis/commit/e5c1adc3ce86d70aa38d8e7bf9eb5b9de9807cb8))
* W4b — 12 P5 suppressions in participant runtime (cognitive complexity) ([0227a47](https://github.com/jvastenaekels/qualis/commit/0227a47e61749a879720fecacd353bc77355bcfd))
* W5 — page/layout/redirect helpers + 3 P5 page-shell suppressions ([e9cf1ba](https://github.com/jvastenaekels/qualis/commit/e9cf1ba2ea0bf140e86c37b232f1e6ba82069268))


### Documentation

* **plan:** project roles refactor — implementation plan (16 tasks) ([16f3336](https://github.com/jvastenaekels/qualis/commit/16f33363a91b69448fd40f3bb4d33ee0337396e7))
* **plans:** add CI warnings W1 implementation plan (utilities + hooks) ([4ccf69b](https://github.com/jvastenaekels/qualis/commit/4ccf69b3af0121c30a076fd4015277526a045da2))
* **plans:** add Wave 1 implementation plan (refresh + scanners) ([ee4f2ef](https://github.com/jvastenaekels/qualis/commit/ee4f2effe862b8cfb2436a309c88423a22370304))
* **plans:** add Wave 2 implementation plan (auth-email flows) ([93a95f9](https://github.com/jvastenaekels/qualis/commit/93a95f9f1aad11ca2390f257538c34333c23e669))
* **plans:** add Wave 3 implementation plan (multi-tenant isolation) ([d1ce860](https://github.com/jvastenaekels/qualis/commit/d1ce860ed423ea3386e75f0f01c10fa502120a52))
* **plans:** add Wave 4 implementation plan (consent & anonymisation) ([8d6c754](https://github.com/jvastenaekels/qualis/commit/8d6c75451d2e39e06a300b57347a974809c9cdf2))
* **plans:** add Wave 5 implementation plan (business-logic abuse) ([224f18b](https://github.com/jvastenaekels/qualis/commit/224f18b201729872c9f6fb8fbfa78fb855c2118f))
* **plans:** add Wave 6 implementation plan (supply chain) ([8c99d59](https://github.com/jvastenaekels/qualis/commit/8c99d599abebd27af47a530a1b29f7b0327665c5))
* **plans:** add Wave 7 implementation plan (deliverables) ([bbcfb48](https://github.com/jvastenaekels/qualis/commit/bbcfb480936353d638c063f942e6d6a20f7e6319))
* **plans:** global footer implementation plan ([2f48db3](https://github.com/jvastenaekels/qualis/commit/2f48db35b6d85069460daaf9c51b3fd70ae84337))
* **readme:** break Statement of need into scannable structure ([a503630](https://github.com/jvastenaekels/qualis/commit/a50363048a04320cf4d01d8c06c577fb0e121b9f))
* **readme:** break Statement of need into scannable structure ([4dcb19e](https://github.com/jvastenaekels/qualis/commit/4dcb19e17394a5eb7cd008c18eba3aadbdf71c75))
* **readme:** reframe multi-language bullet as intercultural studies ([1785759](https://github.com/jvastenaekels/qualis/commit/178575904c9c683bc9851a57037fc6dedc265bd2))
* **readme:** rewrite Statement of need ([4f9c555](https://github.com/jvastenaekels/qualis/commit/4f9c555e3fbefc8cf8bf2e155f04a2effd1279b3))
* **readme:** rewrite Statement of need ([d9c0b09](https://github.com/jvastenaekels/qualis/commit/d9c0b09e4d5840b1fca4524a2f5df930c7a7b621))
* **readme:** trim comparison-table footnote to the "—" caveat only ([58179ec](https://github.com/jvastenaekels/qualis/commit/58179ec457caf5c7564d5a5a2caa3af131d56356))
* refresh comparison table, add Concourse section, drop pricing column ([6dff0cf](https://github.com/jvastenaekels/qualis/commit/6dff0cf8580ecfec90ab8fc0e5ae60aaa8b9b74b))
* **spec:** project roles refactor — Owner/Member/Viewer + quotas ([2e78f56](https://github.com/jvastenaekels/qualis/commit/2e78f5605eda62366bf71a2182e97bddca156d54))
* **specs:** add CI warnings remediation design ([199368f](https://github.com/jvastenaekels/qualis/commit/199368f3b2716401f992c2f3b440614d3ff8e14a))
* **specs:** add design for comprehensive security audit ([c30f7b5](https://github.com/jvastenaekels/qualis/commit/c30f7b526716f82f93ea605d8ec4a2700e3c9fe2))
* **specs:** global footer design ([1529f2d](https://github.com/jvastenaekels/qualis/commit/1529f2d7ea0d77beb8d3d5ac5dedab4454c3c604))
