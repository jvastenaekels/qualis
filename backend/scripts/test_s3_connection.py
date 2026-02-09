#!/usr/bin/env python3
"""
Script pour tester la connexion S3/Cellar pour Libre-Q Audio.
Usage: python scripts/test_s3_connection.py
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime

# Add backend to path (must be before app imports)
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# ruff: noqa: E402
from app.services.storage_service import StorageService  # noqa: E402
from app.core.config import settings  # noqa: E402


async def test_s3_connection():
    """Test complet de la connexion et des opérations S3."""

    print("=" * 70)
    print("🔍 Test de connexion S3/Cellar pour Libre-Q")
    print("=" * 70)
    print()

    # Afficher la configuration
    print("📋 Configuration actuelle:")
    print(f"   Endpoint: {settings.S3_ENDPOINT_URL}")
    print(f"   Bucket: {settings.S3_BUCKET_NAME}")
    print(f"   Region: {settings.S3_REGION}")
    print(
        f"   Access Key ID: {settings.S3_ACCESS_KEY_ID[:10]}..."
        if settings.S3_ACCESS_KEY_ID
        else "   Access Key ID: Non défini"
    )
    print()

    # Vérifier que toutes les variables sont définies
    if not all(
        [
            settings.S3_ENDPOINT_URL,
            settings.S3_BUCKET_NAME,
            settings.S3_ACCESS_KEY_ID,
            settings.S3_SECRET_ACCESS_KEY,
        ]
    ):
        print("❌ Configuration S3 incomplète!")
        print()
        print("Variables manquantes dans .env:")
        if not settings.S3_ENDPOINT_URL:
            print("  - S3_ENDPOINT_URL")
        if not settings.S3_BUCKET_NAME:
            print("  - S3_BUCKET_NAME")
        if not settings.S3_ACCESS_KEY_ID:
            print("  - S3_ACCESS_KEY_ID")
        if not settings.S3_SECRET_ACCESS_KEY:
            print("  - S3_SECRET_ACCESS_KEY")
        print()
        print("Consultez docs/s3-setup.md pour les instructions de configuration.")
        sys.exit(1)

    # Test 1: Initialiser le StorageService
    print("Test 1: Initialisation du StorageService...")
    try:
        storage = StorageService()
        print("   ✅ StorageService initialisé correctement")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        sys.exit(1)

    # Test 2: Vérifier que le bucket existe
    print()
    print("Test 2: Vérification de l'existence du bucket...")
    try:
        response = storage.s3_client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
        print(f"   ✅ Bucket '{settings.S3_BUCKET_NAME}' existe et est accessible")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        print()
        print("Le bucket n'existe pas ou n'est pas accessible.")
        print("Exécutez: python scripts/create_bucket.py")
        sys.exit(1)

    # Test 3: Lister les objets
    print()
    print("Test 3: Liste des objets dans le bucket...")
    try:
        response = storage.s3_client.list_objects_v2(
            Bucket=settings.S3_BUCKET_NAME, MaxKeys=10
        )
        object_count = response.get("KeyCount", 0)
        print("   ✅ Connexion réussie")
        print(f"   📊 Nombre d'objets: {object_count}")

        if object_count > 0:
            print("   📁 Premiers objets:")
            for obj in response.get("Contents", [])[:5]:
                size_kb = obj["Size"] / 1024
                print(f"      - {obj['Key']} ({size_kb:.2f} KB)")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        sys.exit(1)

    # Test 4: Upload d'un fichier de test
    print()
    print("Test 4: Upload d'un fichier de test...")
    test_key = f"test/connection_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    test_content = f"Test de connexion Libre-Q - {datetime.now().isoformat()}"

    try:
        storage.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=test_key,
            Body=test_content.encode("utf-8"),
            ContentType="text/plain",
            Metadata={"test": "connection", "timestamp": datetime.now().isoformat()},
        )
        print(f"   ✅ Upload réussi: {test_key}")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        sys.exit(1)

    # Test 5: Vérifier que le fichier existe
    print()
    print("Test 5: Vérification de l'existence du fichier uploadé...")
    try:
        response = storage.s3_client.head_object(
            Bucket=settings.S3_BUCKET_NAME, Key=test_key
        )
        print("   ✅ Fichier trouvé")
        print(f"   📏 Taille: {response['ContentLength']} bytes")
        print(f"   📅 Dernière modification: {response['LastModified']}")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        sys.exit(1)

    # Test 6: Générer une presigned URL
    print()
    print("Test 6: Génération d'une presigned URL...")
    try:
        url = storage.generate_presigned_url(test_key, expiration=60)
        print("   ✅ Presigned URL générée (expire dans 60s)")
        print(f"   🔗 URL: {url[:80]}...")
        print()
        print("   💡 Testez l'URL dans votre navigateur:")
        print(f"      {url}")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        sys.exit(1)

    # Test 7: Télécharger le fichier
    print()
    print("Test 7: Téléchargement du fichier...")
    try:
        response = storage.s3_client.get_object(
            Bucket=settings.S3_BUCKET_NAME, Key=test_key
        )
        downloaded_content = response["Body"].read().decode("utf-8")

        if downloaded_content == test_content:
            print("   ✅ Contenu téléchargé correspond")
            print(f"   📝 Contenu: {downloaded_content[:50]}...")
        else:
            print("   ⚠️  Contenu ne correspond pas!")
            print(f"   Expected: {test_content}")
            print(f"   Got: {downloaded_content}")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        sys.exit(1)

    # Test 8: Supprimer le fichier de test
    print()
    print("Test 8: Suppression du fichier de test...")
    try:
        await storage.delete_audio(test_key)
        print(f"   ✅ Fichier supprimé: {test_key}")

        # Vérifier qu'il n'existe plus
        try:
            storage.s3_client.head_object(Bucket=settings.S3_BUCKET_NAME, Key=test_key)
            print("   ⚠️  Le fichier existe toujours!")
        except Exception:
            print("   ✅ Confirmation: fichier bien supprimé")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        sys.exit(1)

    # Test 9: Calcul de l'espace utilisé
    print()
    print("Test 9: Calcul de l'espace de stockage utilisé...")
    try:
        total_size = 0
        file_count = 0
        paginator = storage.s3_client.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=settings.S3_BUCKET_NAME):
            for obj in page.get("Contents", []):
                total_size += obj["Size"]
                file_count += 1

        total_mb = total_size / (1024 * 1024)
        print("   ✅ Calcul terminé")
        print(f"   📊 Nombre de fichiers: {file_count}")
        print(f"   💾 Espace utilisé: {total_mb:.2f} MB ({total_size:,} bytes)")

        # Afficher le quota configuré
        quota_mb = 100  # Valeur par défaut
        usage_percent = (total_mb / quota_mb) * 100 if quota_mb > 0 else 0
        print(f"   📈 Quota par défaut: {quota_mb} MB")
        print(f"   📊 Utilisation: {usage_percent:.1f}%")

        if usage_percent > 80:
            print("   ⚠️  Attention: utilisation supérieure à 80%!")
    except Exception as e:
        print(f"   ❌ Erreur: {type(e).__name__}: {str(e)}")
        # Ne pas exit, ce n'est pas critique

    # Résumé final
    print()
    print("=" * 70)
    print("🎉 Tous les tests sont passés avec succès!")
    print("=" * 70)
    print()
    print("✅ La configuration S3/Cellar est correcte et fonctionnelle.")
    print()
    print("Prochaines étapes:")
    print("  1. Lancez le backend: cd backend && uvicorn app.main:app --reload")
    print("  2. Testez l'API audio: pytest tests/integration/test_audio.py -v")
    print("  3. Configurez une étude avec audio activé dans l'admin")
    print("  4. Testez l'enregistrement audio comme participant")
    print()


if __name__ == "__main__":
    asyncio.run(test_s3_connection())
