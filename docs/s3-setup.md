# Configuration S3/Cellar pour Libre-Q Audio

## Prérequis

- Compte Clever Cloud avec accès Cellar
- Python 3.11+ avec boto3 installé
- Accès au fichier `.env` du backend

## 1. Obtenir les credentials Cellar

### Via Console Clever Cloud

1. Connectez-vous à [console.clever-cloud.com](https://console.clever-cloud.com)
2. Sélectionnez votre organisation
3. Créez un add-on Cellar:
   - Cliquez "Create..." → "an add-on" → "Cellar"
   - Région: `eu-west-1` (Paris) ou `us-east-1` (Montréal)
   - Nom: `libre-q-audio-storage`

4. Une fois créé, notez les informations de connexion:
   - **Host**: `cellar-c2.services.clever-cloud.com`
   - **Key ID**: Commence par `CELLAR_ADDON_KEY_ID`
   - **Secret Key**: `CELLAR_ADDON_KEY_SECRET`

### Variables d'environnement

Ces variables sont automatiquement injectées si vous liez l'add-on à votre application. Sinon, ajoutez-les manuellement:

```bash
CELLAR_ADDON_HOST=cellar-c2.services.clever-cloud.com
CELLAR_ADDON_KEY_ID=xxxxxxxxxxxxxxxxxxxxx
CELLAR_ADDON_KEY_SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

## 2. Créer le bucket

### Option A: Via Python script

Créez et exécutez ce script:

```python
# scripts/create_bucket.py
import boto3
from botocore.exceptions import ClientError
import os
from dotenv import load_dotenv

load_dotenv()

s3_client = boto3.client(
    's3',
    endpoint_url=f"https://{os.getenv('CELLAR_ADDON_HOST')}",
    region_name='us-east-1',
    aws_access_key_id=os.getenv('CELLAR_ADDON_KEY_ID'),
    aws_secret_access_key=os.getenv('CELLAR_ADDON_KEY_SECRET')
)

bucket_name = 'libre-q-audio'

try:
    s3_client.create_bucket(Bucket=bucket_name)
    print(f"✅ Bucket '{bucket_name}' créé avec succès")

    # Configurer les permissions (privé par défaut)
    s3_client.put_bucket_acl(
        Bucket=bucket_name,
        ACL='private'
    )
    print("✅ Permissions configurées (private)")

    # Configurer CORS pour l'upload depuis le frontend
    s3_client.put_bucket_cors(
        Bucket=bucket_name,
        CORSConfiguration={
            'CORSRules': [
                {
                    'AllowedOrigins': ['*'],  # Restreindre en production
                    'AllowedMethods': ['GET', 'PUT', 'POST', 'DELETE'],
                    'AllowedHeaders': ['*'],
                    'MaxAgeSeconds': 3600
                }
            ]
        }
    )
    print("✅ CORS configuré")

except ClientError as e:
    if e.response['Error']['Code'] == 'BucketAlreadyOwnedByYou':
        print(f"ℹ️  Bucket '{bucket_name}' existe déjà")
    else:
        print(f"❌ Erreur: {e}")
```

Exécutez:
```bash
cd backend
python scripts/create_bucket.py
```

### Option B: Via AWS CLI

Si vous avez aws-cli installé:

```bash
# Configurer le profil
aws configure --profile clever-cellar
# AWS Access Key ID: <CELLAR_ADDON_KEY_ID>
# AWS Secret Access Key: <CELLAR_ADDON_KEY_SECRET>
# Default region name: us-east-1
# Default output format: json

# Créer le bucket
aws s3 mb s3://libre-q-audio \
  --endpoint-url https://cellar-c2.services.clever-cloud.com \
  --profile clever-cellar

# Vérifier
aws s3 ls --endpoint-url https://cellar-c2.services.clever-cloud.com \
  --profile clever-cellar
```

## 3. Configurer le backend

Modifiez `/home/julien/open-q/backend/.env`:

```bash
# S3/Cellar Storage
S3_ENDPOINT_URL=https://cellar-c2.services.clever-cloud.com
S3_REGION=us-east-1
S3_BUCKET_NAME=libre-q-audio
S3_ACCESS_KEY_ID=${CELLAR_ADDON_KEY_ID}
S3_SECRET_ACCESS_KEY=${CELLAR_ADDON_KEY_SECRET}

# Audio Recording Limits
AUDIO_MAX_FILE_SIZE_MB=10
AUDIO_MAX_DURATION_SECONDS=300
```

**Note**: Si vous utilisez l'injection automatique de Clever Cloud, vous pouvez mapper les variables:

```bash
S3_ENDPOINT_URL=https://${CELLAR_ADDON_HOST}
S3_ACCESS_KEY_ID=${CELLAR_ADDON_KEY_ID}
S3_SECRET_ACCESS_KEY=${CELLAR_ADDON_KEY_SECRET}
```

## 4. Tester la configuration

### Script de test

```python
# scripts/test_s3_connection.py
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.storage_service import StorageService
from app.core.config import settings

async def test_s3_connection():
    print("🔍 Test de connexion S3/Cellar...")
    print(f"   Endpoint: {settings.S3_ENDPOINT_URL}")
    print(f"   Bucket: {settings.S3_BUCKET_NAME}")
    print(f"   Region: {settings.S3_REGION}")

    try:
        storage = StorageService()
        print("✅ StorageService initialisé")

        # Test: List objects (should be empty initially)
        response = storage.s3_client.list_objects_v2(
            Bucket=settings.S3_BUCKET_NAME,
            MaxKeys=1
        )
        print(f"✅ Connexion au bucket réussie")
        print(f"   Objets dans le bucket: {response.get('KeyCount', 0)}")

        # Test: Upload test file
        test_key = "test/connection_test.txt"
        storage.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=test_key,
            Body=b"Test connexion Libre-Q",
            ContentType="text/plain"
        )
        print(f"✅ Upload de test réussi: {test_key}")

        # Test: Generate presigned URL
        url = storage.generate_presigned_url(test_key, expiration=60)
        print(f"✅ Presigned URL générée: {url[:80]}...")

        # Test: Delete test file
        storage.s3_client.delete_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=test_key
        )
        print(f"✅ Suppression de test réussie")

        print("\n🎉 Tous les tests passés! Configuration S3 correcte.")

    except Exception as e:
        print(f"\n❌ Erreur de configuration:")
        print(f"   {type(e).__name__}: {str(e)}")
        print("\nVérifiez:")
        print("  - Les credentials S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY")
        print("  - L'endpoint S3_ENDPOINT_URL est accessible")
        print("  - Le bucket S3_BUCKET_NAME existe")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_s3_connection())
```

Exécutez:
```bash
cd backend
python scripts/test_s3_connection.py
```

### Via les tests d'intégration

```bash
cd backend
pytest tests/integration/test_audio.py -v
```

Si tous les tests passent (12/12), la configuration S3 est correcte!

## 5. Politique de sécurité (Production)

### Bucket ACL

Le bucket doit être **privé** (pas d'accès public):

```python
s3_client.put_bucket_acl(
    Bucket='libre-q-audio',
    ACL='private'
)
```

### CORS restrictif

En production, restreindre les origines autorisées:

```python
s3_client.put_bucket_cors(
    Bucket='libre-q-audio',
    CORSConfiguration={
        'CORSRules': [
            {
                'AllowedOrigins': [
                    'https://libre-q.com',
                    'https://www.libre-q.com'
                ],
                'AllowedMethods': ['GET'],  # Seulement lecture via presigned URLs
                'AllowedHeaders': ['*'],
                'MaxAgeSeconds': 3600
            }
        ]
    }
)
```

**Note**: Les uploads se font via le backend (pas directement depuis le frontend), donc pas besoin de PUT/POST dans CORS.

### Lifecycle Policy (optionnel)

Supprimer automatiquement les uploads incomplets après 7 jours:

```python
s3_client.put_bucket_lifecycle_configuration(
    Bucket='libre-q-audio',
    LifecycleConfiguration={
        'Rules': [
            {
                'Id': 'DeleteIncompleteUploads',
                'Status': 'Enabled',
                'AbortIncompleteMultipartUpload': {
                    'DaysAfterInitiation': 7
                }
            }
        ]
    }
)
```

## 6. Monitoring et limites

### Quota Cellar par plan

| Plan      | Stockage | Bande passante sortante |
|-----------|----------|-------------------------|
| **Small** | 100 GB   | 100 GB/mois             |
| **Medium**| 1 TB     | 1 TB/mois               |
| **Large** | 10 TB    | 10 TB/mois              |

### Calcul approximatif

Avec les paramètres par défaut:
- Max 10 MB par fichier
- Max 180 secondes par enregistrement
- Codec Opus ~16 kbps → ~360 KB par enregistrement typique

**Capacité estimée** (plan Small):
- 100 GB ÷ 0.36 MB ≈ **280 000 enregistrements**
- Avec quota par étude à 100 MB → **1000 études** possibles

### Dashboard Cellar

Surveillez l'utilisation via:
1. Console Clever Cloud → Add-on Cellar → Metrics
2. Backend admin → GeneralSettingsPage → Storage Usage Card

## 7. Troubleshooting

### Erreur: "S3 configuration incomplete"

```
ValueError: S3 configuration incomplete. Check S3_* environment variables.
```

**Solution**: Vérifiez que toutes les variables sont définies dans `.env`:
```bash
grep "^S3_" backend/.env
```

### Erreur: "The specified bucket does not exist"

```
botocore.exceptions.ClientError: An error occurred (NoSuchBucket)
```

**Solution**: Créez le bucket avec le script ci-dessus ou vérifiez le nom dans `S3_BUCKET_NAME`.

### Erreur: "Invalid file type"

```
HTTPException 400: Invalid file type: application/octet-stream
```

**Solution**: Le fichier n'est pas un audio valide. Vérifiez:
- Le MIME type est dans `AUDIO_ALLOWED_MIME_TYPES`
- Le fichier n'est pas corrompu
- Le navigateur utilise le bon codec (WebM ou MP4)

### Erreur: "Storage quota exceeded"

```
HTTPException 507: Storage quota exceeded. Used: 95.00MB / 100MB
```

**Solution**:
1. Augmentez le quota dans PostSortConfigEditor
2. Supprimez les anciens enregistrements
3. Archivez les études complétées

### Presigned URLs expirées

Les URLs expirent après 1 heure. Si les participants voient une erreur 403:
- Rechargez la page pour régénérer l'URL
- Ou augmentez `expiration` dans `generate_presigned_url()` (max 7 jours)

## 8. Migration depuis un autre provider

Si vous migrez depuis AWS S3, DigitalOcean Spaces, ou Minio:

```bash
# Synchroniser les fichiers
aws s3 sync s3://old-bucket s3://libre-q-audio \
  --source-region us-east-1 \
  --source-endpoint-url https://old-provider.com \
  --endpoint-url https://cellar-c2.services.clever-cloud.com
```

Puis mettez à jour les clés S3 dans la base de données:
```sql
UPDATE audio_recordings
SET s3_bucket = 'libre-q-audio'
WHERE s3_bucket = 'old-bucket';
```

## Références

- [Documentation Clever Cloud Cellar](https://www.clever-cloud.com/doc/addons/cellar/)
- [Boto3 S3 Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html)
- [AWS S3 API Compatibility](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
