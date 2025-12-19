# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

import asyncio
from sqlalchemy.exc import IntegrityError
from app.database import engine, Base, SessionLocal
from app.models import User, Study, StudyTranslation, Statement, StatementTranslation, StudyState

async def seed_db():
    print("--- Seeding Database ---")
    
    # Reset DB to ensure clean state
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    async with SessionLocal() as session:
        # 1. Create Owner
        owner = User(email="admin@example.com", hashed_password="hashed_secret", is_active=True)
        session.add(owner)
        await session.commit()
        print("1. User created.")

        # 2. Create Study
        study = Study(
            slug="example-study",
            owner_id=owner.id,
            state=StudyState.active,
            default_language="en", 
            grid_config=[
                {"score": -4, "capacity": 2},
                {"score": -3, "capacity": 3},
                {"score": -2, "capacity": 4},
                {"score": -1, "capacity": 5},
                {"score": 0, "capacity": 6},
                {"score": 1, "capacity": 5},
                {"score": 2, "capacity": 4},
                {"score": 3, "capacity": 3},
                {"score": 4, "capacity": 2}
            ],
            presort_config={
                "age": {
                    "type": "number", 
                    "label": {"en": "Age", "fr": "Âge", "fi": "Ikä"}, 
                    "required": True, 
                    "min": 18, 
                    "max": 99
                },
                "gender": {
                    "type": "select", 
                    "options": [
                        {"value": "Male", "label": {"en": "Male", "fr": "Homme", "fi": "Mies"}},
                        {"value": "Female", "label": {"en": "Female", "fr": "Femme", "fi": "Nainen"}},
                        {"value": "Non-binary", "label": {"en": "Non-binary", "fr": "Non-binaire", "fi": "Ei-binäärinen"}},
                        {"value": "Prefer not to say", "label": {"en": "Prefer not to say", "fr": "Préfère ne pas dire", "fi": "En halua sanoa"}}
                    ], 
                    "label": {"en": "Gender", "fr": "Genre", "fi": "Sukupuoli"}, 
                    "required": True
                },
                "education": {
                    "type": "select", 
                    "options": [
                        {"value": "High School", "label": {"en": "High School", "fr": "Lycée", "fi": "Lukio"}},
                        {"value": "Bachelor", "label": {"en": "Bachelor", "fr": "Licence", "fi": "Kandidaatti"}},
                        {"value": "Master", "label": {"en": "Master", "fr": "Master", "fi": "Maisteri"}},
                        {"value": "PhD", "label": {"en": "PhD", "fr": "Doctorat", "fi": "Tohtori"}},
                        {"value": "Other", "label": {"en": "Other", "fr": "Autre", "fi": "Muu"}}
                    ], 
                    "label": {"en": "Education Level", "fr": "Niveau d'éducation", "fi": "Koulutustaso"}, 
                    "required": True
                }
            },
            postsort_config={
                "extreme_columns": [-4, 4],
                "ask_missing": True,
                "ask_general_comment": True
            }
        )
        session.add(study)
        await session.commit()
        await session.refresh(study)
        print(f"2. Study created (ID: {study.id}).")

        # 3. Add Translations (En, Fr, Fi)
        t_en = StudyTranslation(
            study_id=study.id, 
            language_code="en", 
            title="Study Example", 
            description="General description for the welcome page.", 
            instructions="**Welcome!** This study uses Q-methodology to map different viewpoints on a subject.\n\nYour participation involves 4 smooth steps:\n1. **Context**: A few anonymous questions to get to know you better.\n2. **First Impression**: Instinctively sort statements based on your agreement.\n3. **Distinctions**: Refine your position by arranging cards on a grid.\n4. **Reflections**: Explain your key choices to conclude the study.\n\nThere are no right or wrong answers, only your unique perspective matters.",
            consent_title="I confirm that I am at least 18 years old. I understand that my participation is voluntary and that I can stop at any time. I consent to the anonymous processing of my data for research purposes in accordance with GDPR.",
            consent_description="Data will be used solely for scientific research and stored securely.",
            consent_accept="I agree",
            consent_decline="I do not agree",

        )
        t_fr = StudyTranslation(
            study_id=study.id, 
            language_code="fr", 
            title="Exemple d'étude", 
            description="Description générale pour la page d'accueil.", 
            instructions="**Bienvenue !** Cette étude utilise la méthode Q pour cartographier les différents points de vue sur un sujet.\n\nVotre participation se déroule en 4 étapes fluides :\n1. **Contexte** : Quelques questions anonymes pour mieux vous connaître.\n2. **Première impression** : Triez instinctivement les affirmations selon votre accord.\n3. **Nuances** : Affinez votre position en organisant les cartes sur une grille.\n4. **Réflexions** : Expliquez vos choix les plus marquants pour clore l'étude.\n\nIl n'y a pas de bonne ou de mauvaise réponse, c'est votre propre vision qui nous intéresse.",
            consent_title="Je confirme avoir au moins 18 ans. Je comprends que ma participation est volontaire et que je peux l'arrêter à tout moment. Je consens au traitement anonyme de mes données à des fins de recherche, conformément au RGPD.",
            consent_description="Les données seront utilisées uniquement pour la recherche scientifique et stockées de manière sécurisée.",
            ui_labels={
                "start_button": "Commencer l'étude"
            }
        )
        t_fi = StudyTranslation(
            study_id=study.id,
            language_code="fi",
            title="Tutkimusesimerkki",
            description="Yleinen kuvaus aloitussivulle.",
            instructions="**Tervetuloa!** Tässä tutkimuksessa käytetään Q-metodologiaa erilaisten näkökulmien kartoittamiseen.\n\nOsallistumisesi etenee sujuvasti 4 vaiheessa:\n1. **Taustoitus**: Muutama nimetön kysymys taustasi ymmärtämiseksi.\n2. **Ensivaikutelma**: Lajittele väittämät vaistomaisesti sen mukaan, oletko samaa mieltä.\n3. **Vivahteet**: Tarkenna kantaasi järjestämällä kortit ruudukolle.\n4. **Pohdinta**: Perustele keskeisimmät valintasi tutkimuksen päätteeksi.\n\nOikeita tai vääriä vastauksia ei ole – vain sinun ainutlaatuinen näkökulmasi merkitsee.",
            consent_title="Vahvistan olevani vähintään 18-vuotias. Ymmärrän, että osallistumiseni on vapaaehtoista ja voin keskeyttää sen milloin tahansa. Suostun tietojeni nimettömään käsittelyyn tutkimustarkoituksiin GDPR:n mukaisesti.",
            consent_description="Tietoja käytetään ainoastaan tieteelliseen tutkimukseen ja niitä säilytetään turvallisesti.",
            ui_labels={
                "start_button": "Aloita tutkimus"
            }
        )
        session.add_all([t_en, t_fr, t_fi])
        
        # 4. Add Statements (34 statements)
        statements = []
        for i in range(1, 35):
            stmt = Statement(study_id=study.id, code=f"S{i}")
            statements.append(stmt)
        session.add_all(statements)
        await session.commit()
        
        # Translations for statements (with various lengths for testing)
        LOREM_SHORT = " Lorem ipsum dolor sit amet."
        LOREM_MEDIUM = " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
        LOREM_LONG = " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."
        
        stmt_translations = []
        for i, stmt in enumerate(statements):
            # Vary text length based on index
            if i % 4 == 0:
                extra = ""
            elif i % 4 == 1:
                extra = LOREM_SHORT
            elif i % 4 == 2:
                extra = LOREM_MEDIUM
            else:
                extra = LOREM_LONG

            stmt_translations.append(StatementTranslation(
                statement_id=stmt.id, 
                language_code="en", 
                text=f"Statement {stmt.code}:{extra}"
            ))
            stmt_translations.append(StatementTranslation(
                statement_id=stmt.id, 
                language_code="fr", 
                text=f"Énoncé {stmt.code}:{extra}"
            ))
            stmt_translations.append(StatementTranslation(
                statement_id=stmt.id, 
                language_code="fi", 
                text=f"Väittämä {stmt.code}:{extra}"
            ))
        session.add_all(stmt_translations)
        await session.commit()
        
        print(f"3. {len(statements)} Statements and translations added.")
        print("--- Seeding Complete ---")

if __name__ == "__main__":
    asyncio.run(seed_db())
