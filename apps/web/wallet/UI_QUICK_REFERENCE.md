# UI Enhancement Quick Reference

## 🎨 Design Tokens

### Timing Functions
```css
/* Apple-style smooth easing */
cubic-bezier(0.4, 0, 0.2, 1)

/* Quick interactions */
0.2s ease

/* Standard transitions */
0.3s cubic-bezier(0.4, 0, 0.2, 1)

/* Page transitions */
0.4s cubic-bezier(0.4, 0, 0.2, 1)
```

### Transform Values
```css
/* Hover lifts */
translateY(-2px)   /* Buttons, small elements */
translateY(-4px)   /* Cards, large elements */

/* Active states */
translateY(0)      /* Pressed buttons */
translateY(-1px)   /* Subtle press */

/* Scale effects */
scale(0.98)        /* Entry animation */
scale(1.01)        /* Focus/hover */
scale(1.02)        /* Active selection */
```

### Colors by State
```css
/* Success */
--kc-good: #10b981

/* Error */
--kc-bad: #ef4444

/* Focus/Active */
--kc-accent-blue: #60a5fa

/* Warning */
--kc-accent-yellow: #fbbf24
```

## 🧩 Component Usage

### Button with Ripple
```tsx
<Button
  variant="primary"
  onClick={handleClick}
  ripple={true}        // default
  loading={isLoading}
  icon={<span>📤</span>}
>
  Send
</Button>
```

### Input with Validation
```tsx
<Input
  label="Amount"
  value={amount}
  onChange={handleChange}
  error={errors.amount}
  success={isAmountValid}  // Show checkmark
  animateOnFocus={true}    // default
  icon={<span>💰</span>}
/>
```

### Card with Hover Effect
```tsx
<Card
  variant="glass"
  hoverable={true}   // Enables lift + glow
  clickable={true}   // Adds cursor pointer + active state
>
  <CardBody>
    Content here
  </CardBody>
</Card>
```

### Badge with Pulse
```tsx
<Badge
  variant="success"
  size="md"
  pulse={true}  // Animated dot
>
  New
</Badge>
```

## 📐 CSS Patterns

### Adding Hover Lift
```css
.element {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.element:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}
```

### Shimmer Effect
```css
.element {
  position: relative;
  overflow: hidden;
}

.element::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.element:hover::before {
  left: 100%;
}
```

### Gradient Border
```css
.card {
  position: relative;
  overflow: hidden;
}

.card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, transparent, rgba(59, 130, 246, 0.2), transparent);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.card:hover::after {
  opacity: 1;
}
```

### Success Toast
```css
.toast {
  position: fixed;
  top: 24px;
  right: 24px;
  animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1),
             fadeOut 0.3s ease 3.7s;
}

@keyframes slideInRight {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

## 🎭 Animation Recipes

### Shake Error
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}

.error {
  animation: shake 0.4s ease;
}
```

### Success Pop
```css
@keyframes successPop {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.successIcon {
  animation: successPop 0.3s ease;
}
```

### Pulse Ring
```css
@keyframes pulseRing {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

.badge::after {
  animation: pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

## 🎯 State Management Patterns

### Validation States
```tsx
const [value, setValue] = useState('');
const [error, setError] = useState('');

// Compute validation
const isValid = value.length >= 20 && validate(value).valid;

// In JSX
<Input
  value={value}
  onChange={(e) => {
    setValue(e.target.value);
    if (error) setError(''); // Clear error on change
  }}
  error={error}
  success={isValid}
/>
```

### Success Flow
```tsx
const [loading, setLoading] = useState(false);
const [success, setSuccess] = useState(false);
const [showToast, setShowToast] = useState(false);

const handleSubmit = async () => {
  setLoading(true);
  setSuccess(false);
  
  // Simulate API call
  await delay(2000);
  
  setLoading(false);
  setSuccess(true);
  setShowToast(true);
  
  // Auto-dismiss
  setTimeout(() => {
    setShowToast(false);
    // Clear form
  }, 3000);
};
```

### Ripple Effect
```tsx
const [ripples, setRipples] = useState<Ripple[]>([]);
const buttonRef = useRef<HTMLButtonElement>(null);

const handleClick = (e: React.MouseEvent) => {
  const rect = buttonRef.current?.getBoundingClientRect();
  if (!rect) return;
  
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  const newRipple = { x, y, id: Date.now() };
  setRipples([...ripples, newRipple]);
  
  // Auto cleanup
  setTimeout(() => {
    setRipples((prev) => prev.filter(r => r.id !== newRipple.id));
  }, 600);
};
```

## 📋 Checklist for New Components

When creating a new component, ensure:

- [ ] Transitions use `cubic-bezier(0.4, 0, 0.2, 1)`
- [ ] Hover states have visual feedback
- [ ] Active/pressed states are defined
- [ ] Focus states are keyboard-accessible
- [ ] Loading states are handled
- [ ] Success/error states have animations
- [ ] Responsive to different screen sizes
- [ ] Semantic HTML is used
- [ ] ARIA labels where needed
- [ ] Color contrast is sufficient

## 🚀 Performance Tips

### DO:
✅ Use `transform` and `opacity` for animations
✅ Clean up timeouts and intervals
✅ Use CSS animations over JavaScript where possible
✅ Batch state updates
✅ Debounce rapid events (resize, scroll)

### DON'T:
❌ Animate `width`, `height`, `top`, `left`
❌ Create memory leaks with uncleared timeouts
❌ Chain too many sequential animations
❌ Trigger layout recalculations in loops
❌ Add transitions to every element

## 🎨 Color States Quick Reference

### Buttons
```
Default:  border: rgba(59, 130, 246, 0.12)
Hover:    border: rgba(59, 130, 246, 0.55)
Active:   border: rgba(59, 130, 246, 0.8)
Disabled: opacity: 0.5
```

### Inputs
```
Default:  border: rgba(59, 130, 246, 0.12)
Focus:    border: rgba(59, 130, 246, 0.65)
          shadow: 0 0 0 3px rgba(59, 130, 246, 0.18)
Error:    border: rgba(239, 68, 68, 0.65)
Success:  border: rgba(16, 185, 129, 0.65)
```

### Cards
```
Default:  border: rgba(59, 130, 246, 0.12)
Hover:    border: rgba(59, 130, 246, 0.4)
          shadow: 0 16px 48px rgba(0, 0, 0, 0.4)
```

## 🎬 Animation Durations

```
Icon spin:        1s
Ripple:           600ms
Page transition:  400ms
Card hover:       300ms
Button hover:     300ms
Input focus:      300ms
Link hover:       200ms
Shimmer:          2s (infinite)
Pulse:            2s (infinite)
```

## 📦 File Structure

```
components/
├── Button.tsx              # Ripple effect logic
├── Button.module.css       # Ripple animations
├── Input.tsx               # Validation states
├── Input.module.css        # Shake, success animations
├── Card.module.css         # Hover effects
├── Badge.module.css        # Pulse animations
├── Toast.module.css        # Slide-in, shimmer
└── PageTransition.module.css  # Blur, scale

pages/
├── send/
│   ├── page.tsx            # Success flow
│   └── send.module.css     # Fee options, toast
└── dashboard/
    └── dashboard.module.css # Account cards, tables

globals.css                 # Base transitions, timing
```

## 🔗 Related Docs

- [Visual Demo Guide](./UI_DEMO_GUIDE.md)
- [CSS Variables Reference](./app/globals.css)

---

**Quick Copy-Paste Snippets** - Keep this handy when building new components!
