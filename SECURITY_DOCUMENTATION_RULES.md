# 🔐 Security Documentation Rules

## ⚠️ CRITICAL RULE: NO API KEYS IN DOCUMENTATION

**This rule applies to ALL documentation files in this project.**

---

## 📋 Documentation Security Standards

### **✅ ALWAYS DO**:
- Use placeholder text for API keys: `your_api_key_here`, `[YOUR_API_KEY]`, `YOUR_KEY_HERE`
- Include key descriptions (purpose, restrictions, source)
- Document setup instructions without exposing credentials
- Review commits for accidental key exposure before pushing
- Store actual keys only in `.env` files (never committed)

### **❌ NEVER DO**:
- Include actual API keys in any `.md` files
- Commit real credentials to git repository
- Share actual keys in code comments
- Use real database URLs or connection strings in docs
- Expose production secrets in example code

---

## 📝 Approved Placeholder Formats

### **Environment Variables**:
```bash
# Good examples
VITE_GOOGLE_MAPS_API_KEY=your_maps_api_key_here
VITE_GOOGLE_GEOCODING_API_KEY=your_geocoding_api_key_here
DATABASE_URL=your_database_connection_string
SUPABASE_KEY=[YOUR_SUPABASE_ANON_KEY]
```

### **Code Examples**:
```typescript
// Good example
const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY; // Set in .env file

// Bad example - never do this
const apiKey = "AIzaSyC..."; // Real key exposed
```

### **Configuration Examples**:
```json
{
  "apiEndpoint": "https://your-api-endpoint.com",
  "apiKey": "[YOUR_API_KEY]",
  "projectId": "your-project-id"
}
```

---

## 🚨 Security Incident Response

### **If API Keys Are Exposed**:
1. **Immediate Action**: Rotate/regenerate all exposed keys
2. **Update Environment**: Replace keys in `.env` files
3. **Clean Documentation**: Remove keys from docs, use placeholders
4. **Commit Fix**: Document the security fix in git history
5. **Monitor Usage**: Check for unauthorized API usage

### **Prevention Checklist**:
- [ ] Review all `.md` files for secrets before committing
- [ ] Use `git diff` to check staged changes
- [ ] Set up pre-commit hooks to scan for secrets
- [ ] Regular security audits of documentation files
- [ ] Team training on secure documentation practices

---

## 🛡️ Tools and Best Practices

### **GitHub Security Features**:
- GitHub automatically scans repositories for exposed secrets
- Secret scanning alerts are sent to repository administrators
- Dependabot alerts for vulnerable dependencies

### **Pre-commit Security Scanning**:
```bash
# Install git-secrets (example tool)
git secrets --install
git secrets --register-aws
git secrets --scan
```

### **Documentation Review Process**:
1. Write documentation with placeholders
2. Review for any accidentally included secrets
3. Test instructions with placeholder values
4. Commit only after security review

---

## 📚 Project-Specific Rules

### **Mapping System Documentation**:
- Google API keys: Always use `your_maps_api_key_here` format
- Database URLs: Always use `your_database_url_here` format
- Client secrets: Never document actual values

### **File-Specific Guidelines**:
- **README files**: Setup instructions with placeholders only
- **Progress trackers**: No credentials, focus on implementation status
- **Session summaries**: Document architecture, not secrets
- **Quick start guides**: Environment setup with placeholder examples

---

## ✅ Security Rule Compliance

**This rule is now documented in**:
- `SECURITY_DOCUMENTATION_RULES.md` (this file)
- `MAPPING_SYSTEM_QUICK_START.md` (security section added)
- All future documentation will follow these standards

**Enforcement**:
- Code reviews must check for exposed secrets
- Documentation updates require security review
- Any secret exposure triggers immediate rotation
- Team members must follow placeholder-only documentation

---

**Remember: Documentation guides setup - it should never expose actual credentials!**