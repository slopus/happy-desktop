#!/bin/bash
# Builds happy-ios and Steve's UI-test driver for Steve's phone, on the Mac:
# the iOS Simulator device the take records.
#
# usage: build.sh <happy-ios checkout> <derived data> <simulator udid>
#
# The checkout is happy's main as exported for this take; this script copies
# the driver in, gives the app and its runner the demo's own bundle IDs so no
# other build on the phone is replaced.
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
SOURCE=$1
DERIVED=$2
DEVICE=$3
HERE=$(cd "$(dirname "$0")" && pwd)

cp "$HERE/TeamDemoUITests.swift" "$SOURCE/Tests/HappyDirectUITests/TeamDemoUITests.swift"
perl -0pi -e '
    s/PRODUCT_BUNDLE_IDENTIFIER: com\.slopus\.happy\.dev\n/PRODUCT_BUNDLE_IDENTIFIER: com.slopus.happy.teamdemo\n/;
    s/PRODUCT_BUNDLE_IDENTIFIER: com\.slopus\.happy\.direct-ui-tests\n/PRODUCT_BUNDLE_IDENTIFIER: com.slopus.happy.teamdemo-ui-tests\n/;
' "$SOURCE/project.yml"
grep -q "com.slopus.happy.teamdemo$" "$SOURCE/project.yml"

cd "$SOURCE"
xcodegen generate --spec project.yml --quiet
xcodebuild build-for-testing -project Happy.xcodeproj -scheme HappyDirectUI -configuration Debug \
    -destination "id=$DEVICE" -derivedDataPath "$DERIVED" \
    -clonedSourcePackagesDirPath "$DERIVED/SourcePackages" \
    -quiet
ls "$DERIVED/Build/Products/"*.xctestrun
