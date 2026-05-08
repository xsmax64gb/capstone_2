# Drop Achievement Collections Migration

## Purpose
This script removes the achievement system collections from the database:
- `achievements` - Achievement definitions
- `user_achievements` - User achievement records

## When to Run
Run this script after deploying the code changes that remove the achievement system.

## How to Run

```bash
cd BE
node scripts/drop-achievement-collections.js
```

## What It Does
1. Connects to MongoDB
2. Checks if achievement collections exist
3. Drops the collections if they exist
4. Reports the results

## Safety
- The script only drops the two specific achievement collections
- It will skip collections that don't exist
- No other data is affected

## Rollback
If you need to restore the achievement system:
1. Revert the code changes
2. Restore the collections from a database backup
3. Re-deploy the achievement system code
