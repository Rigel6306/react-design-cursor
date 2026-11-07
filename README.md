# React Design Cursor

An interactive React component that simulates a designer outlining your UI elements in real-time with an animated cursor, wireframe boxes, and dimension badges. 

[![npm version](https://img.shields.io/npm/v/react-design-cursor.svg)](https://www.npmjs.com/package/react-design-cursor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Features

- 🖱️ **Human-like Motion:** Smooth, curved cursor movement that mimics a real designer exploring a UI layout.
- 📐 **Automated Wireframing:** Dynamically walks your component tree to draw dashed bounding boxes, sizing dimensions, and animated pulse effects.
- 🧠 **Smart Element Profiling:** Automatically categorizes elements (`frame`, `card`, `item`, `quick`) to apply optimized timing and styling.
- 👁️ **Smart Triggers:** Runs automatically on component mount or dynamically when scrolled into view using `IntersectionObserver`.
- ♿ **Accessible & SSR Safe:** Fully respects `prefers-reduced-motion` settings and degrades gracefully for non-JS environments.

---

## Installation

Install the package via your preferred package manager:


#### NPM
```bash
npm i react-design-cursor
```

#### PNPM
```bash
pnpm add react-design-cursor
```
### yarn
```bash
yarn add react-design-cursor
```


## Installation
Wrap any section or component you want to bring to life with <DesignCursor>:
```tsx
import { DesignCursor } from "react-design-cursor";

export const MyComponent = ()=>  {
  return (
    <DesignCursor label="Lead Designer" loop>
      <div style={{ padding: "40px", background: "#f8fafc", borderRadius: "16px" }}>
        <h2>My Awesome Feature Section</h2>
        <p>This entire block will be outlined and "designed" by an animated cursor!</p>
      </div>
    </DesignCursor>
  );
}
```
## Props API

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `children` | `React.ReactNode` | **Required** | The UI elements you want wrapped and animated. |
| `className` | `string` | `undefined` | Optional CSS class name applied to the container wrapper. |
| `style` | `React.CSSProperties` | `undefined` | Optional inline styles applied to the container wrapper. |
| `color` | `string` | `"#7c5cff"` | The CSS color used for the cursor, wireframes, and labels. |
| `label` | `string` | `"Designer"` | Text label displayed next to the animated cursor. |
| `speed` | `number` | `1` | Multiplier for animation speed (`1` = normal speed, `2` = twice as fast). |
| `loop` | `boolean` | `false` | Whether to replay the animation forever while in view. |
| `replay` | `boolean` | `true` | Whether the animation should re-run if it scrolls back into view. |
| `loopDelay` | `number` | `2800` | Pause duration between loops in milliseconds. |
| `startDelay` | `number` | `500` | Delay before the first animation run starts in milliseconds. |
| `maxDepth` | `number` | `3` | How deep into the wrapped component tree to traverse (`1` = direct children only). |
| `maxSteps` | `number` | `undefined` | Safety cap on the number of boxes drawn per run. |
| `selector` | `string` | `undefined` | Optional CSS selector to specifically target custom elements instead of walking the entire tree. |
| `quickSelector` | `string` | `undefined` | Elements matching this selector are drawn very fast with no badges (great for icon grids). |
| `trigger` | `"mount" \| "inView"` | `"inView"` | Determines when the animation starts (`mount` or when scrolled into view). |