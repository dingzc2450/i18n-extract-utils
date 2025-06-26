// 测试增强React框架的示例组件
import React from 'react';

export default function TestComponent() {
  const userName = 'Alice';
  const count = 5;

  return (
    <div className="test-component">
      <h1>{"___Hello World___"}</h1>
      <p>
        {"___Welcome to our application___"}
      </p>
      <span className="user-info">
        {"___User: {userName}___".replace('{userName}', userName)}
      </span>
      <div>
        {"___You have {count} items___".replace('{count}', count.toString())}
      </div>
      <button onClick={() => alert("___Click me___")}>
        {"___Submit___"}
      </button>
      <p>
        This is a regular text that should not be translated.
      </p>
      <div title="___This is a tooltip___">
        Some content
      </div>
    </div>
  );
}
