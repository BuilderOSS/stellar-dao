#!/bin/bash
#
# Goldsky Environment Setup Script
#
# Interactively configure environment variables for Goldsky pipeline deployment
#
# Usage:
#   ./scripts/setup-env.sh
#

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PACKAGE_DIR/.env"
ENV_EXAMPLE="$PACKAGE_DIR/.env.example"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Goldsky Environment Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}⚠️  .env file already exists at:${NC}"
  echo "   $ENV_FILE"
  echo ""
  read -p "Overwrite existing file? (y/N): " overwrite

  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Setup cancelled${NC}"
    exit 0
  fi

  # Backup existing file
  BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$ENV_FILE" "$BACKUP_FILE"
  echo ""
  echo -e "${GREEN}✓ Backed up to: $BACKUP_FILE${NC}"
  echo ""
fi

echo -e "${CYAN}This script will help you configure:${NC}"
echo "  1. Goldsky API credentials"
echo "  2. PostgreSQL database connection"
echo "  3. Neon database secrets"
echo "  4. Contract deployment IDs"
echo ""
echo -e "${YELLOW}Tip: Leave blank to use example/default values${NC}"
echo ""

# Function to prompt for value
prompt_value() {
  local var_name="$1"
  local description="$2"
  local default="$3"
  local secret="${4:-false}"

  echo -e "${CYAN}$description${NC}"

  if [ -n "$default" ]; then
    echo -e "${YELLOW}  Default: $default${NC}"
  fi

  if [ "$secret" = "true" ]; then
    read -s -p "  $var_name: " value
    echo ""
  else
    read -p "  $var_name: " value
  fi

  if [ -z "$value" ] && [ -n "$default" ]; then
    value="$default"
  fi

  echo "$value"
}

# Start building .env content
ENV_CONTENT="# Goldsky Environment Configuration
# Generated: $(date)

#
# Goldsky API
#

"

# Goldsky API Key
echo ""
value=$(prompt_value "GOLDSKY_API_KEY" "Enter your Goldsky API key" "" "true")
ENV_CONTENT+="GOLDSKY_API_KEY=\"$value\"

"

#
# PostgreSQL Database
#

ENV_CONTENT+="#
# PostgreSQL Database (Neon)
#

"

echo ""
echo -e "${BLUE}──────────────────────────────────────────────${NC}"
echo ""

# Database URLs
value=$(prompt_value "DATABASE_URL" "Enter your Neon database URL (full admin access)" "postgres://user:pass@host/dbname")
ENV_CONTENT+="# Full admin access (for migrations)
DATABASE_URL=\"$value\"

"

value=$(prompt_value "APP_DATABASE_URL" "Enter your app database URL (read-only app_server role)" "postgres://app_server:pass@host/dbname")
ENV_CONTENT+="# Read-only access for app queries
APP_DATABASE_URL=\"$value\"

"

#
# Neon Secrets for Goldsky
#

ENV_CONTENT+="#
# Neon Database Secrets for Goldsky
# These are injected into the pipeline as secrets
#

"

echo ""
echo -e "${BLUE}──────────────────────────────────────────────${NC}"
echo ""
echo -e "${YELLOW}The following secrets will be used in goldsky.yaml${NC}"
echo ""

value=$(prompt_value "GOLDSKY_SECRET_NEON_HOST" "Neon database host" "ep-example-123456.us-east-2.aws.neon.tech")
ENV_CONTENT+="GOLDSKY_SECRET_NEON_HOST=\"$value\"
"

value=$(prompt_value "GOLDSKY_SECRET_NEON_PORT" "Neon database port" "5432")
ENV_CONTENT+="GOLDSKY_SECRET_NEON_PORT=\"$value\"
"

value=$(prompt_value "GOLDSKY_SECRET_NEON_DATABASE" "Neon database name" "neondb")
ENV_CONTENT+="GOLDSKY_SECRET_NEON_DATABASE=\"$value\"
"

value=$(prompt_value "GOLDSKY_SECRET_NEON_USER" "Neon database user (goldsky_writer role)" "goldsky_writer")
ENV_CONTENT+="GOLDSKY_SECRET_NEON_USER=\"$value\"
"

value=$(prompt_value "GOLDSKY_SECRET_NEON_PASSWORD" "Neon database password" "" "true")
ENV_CONTENT+="GOLDSKY_SECRET_NEON_PASSWORD=\"$value\"

"

#
# Contract Deployment IDs
#

ENV_CONTENT+="#
# Contract Deployment IDs
# Used to filter events in the pipeline
#

"

echo ""
echo -e "${BLUE}──────────────────────────────────────────────${NC}"
echo ""
echo -e "${YELLOW}Enter your contract deployment IDs from Stellar${NC}"
echo ""

value=$(prompt_value "DEPLOYMENT_TOKEN" "Token contract deployment ID" "")
ENV_CONTENT+="DEPLOYMENT_TOKEN=\"$value\"
"

value=$(prompt_value "DEPLOYMENT_GOVERNOR" "Governor contract deployment ID" "")
ENV_CONTENT+="DEPLOYMENT_GOVERNOR=\"$value\"
"

value=$(prompt_value "DEPLOYMENT_TREASURY" "Treasury contract deployment ID" "")
ENV_CONTENT+="DEPLOYMENT_TREASURY=\"$value\"
"

value=$(prompt_value "DEPLOYMENT_AUCTION" "Auction contract deployment ID" "")
ENV_CONTENT+="DEPLOYMENT_AUCTION=\"$value\"

"

# Write .env file
echo "$ENV_CONTENT" > "$ENV_FILE"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Environment configuration saved!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Configuration file:${NC}"
echo "  $ENV_FILE"
echo ""
echo -e "${CYAN}Created .env.example template:${NC}"

# Create .env.example
cat > "$ENV_EXAMPLE" << 'EOF'
# Goldsky Environment Configuration

#
# Goldsky API
#

GOLDSKY_API_KEY="your_goldsky_api_key"

#
# PostgreSQL Database (Neon)
#

# Full admin access (for migrations)
DATABASE_URL="postgres://user:password@host.neon.tech:5432/dbname"

# Read-only access for app queries
APP_DATABASE_URL="postgres://app_server:password@host.neon.tech:5432/dbname"

#
# Neon Database Secrets for Goldsky
# These are injected into the pipeline as secrets
#

GOLDSKY_SECRET_NEON_HOST="ep-example-123456.us-east-2.aws.neon.tech"
GOLDSKY_SECRET_NEON_PORT="5432"
GOLDSKY_SECRET_NEON_DATABASE="neondb"
GOLDSKY_SECRET_NEON_USER="goldsky_writer"
GOLDSKY_SECRET_NEON_PASSWORD="your_writer_password"

#
# Contract Deployment IDs
# Used to filter events in the pipeline
#

DEPLOYMENT_TOKEN="your_token_deployment_id"
DEPLOYMENT_GOVERNOR="your_governor_deployment_id"
DEPLOYMENT_TREASURY="your_treasury_deployment_id"
DEPLOYMENT_AUCTION="your_auction_deployment_id"
EOF

echo "  $ENV_EXAMPLE"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review and verify your configuration in .env"
echo "  2. Run database migrations:"
echo "     cd ../../db && ./migrate.sh"
echo "  3. Generate pipeline configuration:"
echo "     pnpm generate"
echo "  4. Deploy to Goldsky:"
echo "     ./scripts/deploy.sh deploy"
echo ""
