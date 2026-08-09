---
"@semantask/auth": patch
"@semantask/web": patch
"@semantask/db": patch
"@semantask/socket": patch
---

Remove automatic step-up OTP challenges from normal session refresh and bootstrap. Access-token refresh rotates tokens without creating challenges; challenge UI/API and StepUpChallenge model are removed as dead code.
