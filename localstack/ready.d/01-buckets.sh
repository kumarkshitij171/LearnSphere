#!/bin/bash
# Runs on every LocalStack start. Community LocalStack keeps S3 in memory, so a restart
# drops every bucket; recreate them (and the browser-upload CORS) before anything uses them.
set -euo pipefail

for bucket in raw-video processed-video; do
  awslocal s3api head-bucket --bucket "$bucket" 2>/dev/null || awslocal s3 mb "s3://$bucket"
done

awslocal s3api put-bucket-cors --bucket raw-video --cors-configuration '{
  "CORSRules": [{
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }]
}'

echo "LearnSphere buckets ready: raw-video, processed-video"
