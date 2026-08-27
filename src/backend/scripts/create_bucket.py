#!/usr/bin/env python3
"""
Script pour créer le bucket S3/Cellar pour Qualis Audio.
Usage: python scripts/create_bucket.py
"""

import boto3
from botocore.exceptions import ClientError
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
backend_dir = Path(__file__).parent.parent
load_dotenv(backend_dir / ".env")


def create_audio_bucket():
    """Crée et configure le bucket pour les enregistrements audio."""

    # Configuration
    endpoint_url = os.getenv("S3_ENDPOINT_URL")
    bucket_name = os.getenv("S3_BUCKET_NAME")
    access_key = os.getenv("S3_ACCESS_KEY_ID")
    secret_key = os.getenv("S3_SECRET_ACCESS_KEY")
    region = os.getenv("S3_REGION", "us-east-1")

    # Validation
    if not all([endpoint_url, bucket_name, access_key, secret_key]):
        print("❌ Configuration S3 incomplète dans .env")
        print("   Variables requises:")
        print("   - S3_ENDPOINT_URL")
        print("   - S3_BUCKET_NAME")
        print("   - S3_ACCESS_KEY_ID")
        print("   - S3_SECRET_ACCESS_KEY")
        sys.exit(1)

    print("🔧 Configuration S3:")
    print(f"   Endpoint: {endpoint_url}")
    print(f"   Bucket: {bucket_name}")
    print(f"   Region: {region}")
    print()

    # Créer le client S3
    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        print("✅ Client S3 initialisé")
    except Exception as e:
        print(f"❌ Erreur d'initialisation du client S3: {e}")
        sys.exit(1)

    # Créer le bucket
    try:
        s3_client.create_bucket(Bucket=bucket_name)
        print(f"✅ Bucket '{bucket_name}' créé avec succès")
    except ClientError as e:
        if e.response["Error"]["Code"] == "BucketAlreadyOwnedByYou":
            print(f"ℹ️  Bucket '{bucket_name}' existe déjà (vous en êtes propriétaire)")
        elif e.response["Error"]["Code"] == "BucketAlreadyExists":
            print(f"⚠️  Bucket '{bucket_name}' existe déjà (propriétaire différent)")
            print("   Choisissez un nom de bucket différent")
            sys.exit(1)
        else:
            print(f"❌ Erreur lors de la création du bucket: {e}")
            sys.exit(1)

    # Configurer les permissions (privé)
    try:
        s3_client.put_bucket_acl(Bucket=bucket_name, ACL="private")
        print("✅ Permissions configurées (private)")
    except ClientError as e:
        print(f"⚠️  Avertissement ACL: {e}")

    # Configurer CORS pour les presigned URLs
    try:
        s3_client.put_bucket_cors(
            Bucket=bucket_name,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": ["*"],  # À restreindre en production
                        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
                        "AllowedHeaders": ["*"],
                        "MaxAgeSeconds": 3600,
                        "ExposeHeaders": ["ETag"],
                    }
                ]
            },
        )
        print("✅ CORS configuré")
        print("   ⚠️  AllowedOrigins: ['*'] - À restreindre en production!")
    except ClientError as e:
        print(f"⚠️  Avertissement CORS: {e}")

    # Configurer lifecycle pour nettoyer les uploads incomplets
    try:
        s3_client.put_bucket_lifecycle_configuration(
            Bucket=bucket_name,
            LifecycleConfiguration={
                "Rules": [
                    {
                        "Id": "DeleteIncompleteUploads",
                        "Status": "Enabled",
                        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7},
                        "Filter": {"Prefix": ""},
                    }
                ]
            },
        )
        print(
            "✅ Lifecycle policy configurée (suppression uploads incomplets après 7 jours)"
        )
    except ClientError as e:
        print(f"⚠️  Avertissement Lifecycle: {e}")

    print()
    print("🎉 Configuration du bucket terminée!")
    print()
    print("Prochaines étapes:")
    print("  1. Testez la connexion: python scripts/test_s3_connection.py")
    print("  2. Lancez le backend: uvicorn app.main:app --reload")
    print("  3. Lancez les tests: pytest tests/integration/test_audio.py")


if __name__ == "__main__":
    create_audio_bucket()
