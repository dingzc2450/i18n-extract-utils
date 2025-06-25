import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper functions
function createTempFile(content: string, extension: string = "vue"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch (err) { console.error(`Error removing temp file ${file}:`, err); }
    }
  });
  tempFiles.length = 0;
});

describe("Vue Framework Tests", () => {
  describe("Vue 3 Composition API", () => {
    test("should handle basic Vue 3 setup with template", () => {
      const code = `
<template>
  <div class="hello">
    <h1>___欢迎使用Vue___</h1>
    <p>___这是一个示例组件___</p>
    <button @click="handleClick">___点击我___</button>
  </div>
</template>

<script>
import { ref } from 'vue'

export default {
  name: 'HelloWorld',
  setup() {
    const count = ref(0)
    
    const handleClick = () => {
      count.value++
    }
    
    return {
      count,
      handleClick
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.code).toMatch(/import\s*?{\s*?useI18n\s*?}\s*?from\s*?"vue-i18n"/);
      expect(result.code).toContain('useI18n()');
      expect(result.extractedStrings.length).toBe(3);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining(['欢迎使用Vue', '这是一个示例组件', '点击我'])
      );
    });

    test("should handle Vue 3 script setup syntax", () => {
      const code = `
<template>
  <div>
    <h1>___用户管理___</h1>
    <input v-model="userName" :placeholder="___请输入用户名___" />
    <button @click="submit">___提交___</button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const userName = ref('')
const isValid = computed(() => userName.value.length > 0)

const submit = () => {
  if (isValid.value) {
    console.log('___提交成功___')
  } else {
    alert('___请填写用户名___')
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.code).toMatch(/import\s*?{\s*?useI18n\s*?}\s*?from\s*?"vue-i18n"/);
      expect(result.code).toContain('useI18n()');
      expect(result.extractedStrings.length).toBe(5);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining(['用户管理', '请输入用户名', '提交', '提交成功', '请填写用户名'])
      );
    });

    test("should handle Vue 3 with TypeScript", () => {
      const code = `
<template>
  <div class="user-profile">
    <h2>___个人资料___</h2>
    <form @submit.prevent="updateProfile">
      <label>___姓名___: 
        <input v-model="profile.name" type="text" />
      </label>
      <label>___邮箱___: 
        <input v-model="profile.email" type="email" />
      </label>
      <button type="submit">___更新资料___</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

interface UserProfile {
  name: string
  email: string
}

const profile = reactive<UserProfile>({
  name: '',
  email: ''
})

const updateProfile = () => {
  console.log('___更新用户资料___', profile)
}
</script>
      `;
      
      const tempFile = createTempFile(code, "vue");
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.code).toMatch(/import\s*?{\s*?useI18n\s*?}\s*?from\s*?"vue-i18n"/);
      expect(result.extractedStrings.length).toBe(5);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining(['个人资料', '姓名', '邮箱', '更新资料', '更新用户资料'])
      );
    });
  });

  describe("Vue 2 Options API", () => {
    test("should handle Vue 2 component with data and methods", () => {
      const code = `
<template>
  <div class="todo-app">
    <h1>___待办事项___</h1>
    <input v-model="newTodo" :placeholder="___输入新任务___" />
    <button @click="addTodo">___添加___</button>
    <ul>
      <li v-for="todo in todos" :key="todo.id">
        {{ todo.text }}
        <button @click="removeTodo(todo.id)">___删除___</button>
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'TodoApp',
  data() {
    return {
      newTodo: '',
      todos: []
    }
  },
  methods: {
    addTodo() {
      if (this.newTodo.trim()) {
        this.todos.push({
          id: Date.now(),
          text: this.newTodo
        })
        this.newTodo = ''
        this.$message.success('___任务添加成功___')
      } else {
        this.$message.error('___请输入任务内容___')
      }
    },
    removeTodo(id) {
      const index = this.todos.findIndex(todo => todo.id === id)
      if (index > -1) {
        this.todos.splice(index, 1)
        this.$message.info('___任务已删除___')
      }
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue2",
          i18nImport: {
            name: "$t",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(7);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '待办事项', '输入新任务', '添加', '删除', 
          '任务添加成功', '请输入任务内容', '任务已删除'
        ])
      );
    });

    test("should handle Vue 2 with computed properties and watchers", () => {
      const code = `
<template>
  <div class="search-component">
    <h2>___搜索页面___</h2>
    <input 
      v-model="searchQuery" 
      :placeholder="___请输入搜索关键词___"
      @input="onSearchInput"
    />
    <div v-if="isLoading">___正在搜索...___</div>
    <div v-else-if="searchResults.length === 0 && searchQuery">
      ___未找到相关结果___
    </div>
    <ul v-else>
      <li v-for="result in searchResults" :key="result.id">
        {{ result.title }}
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'SearchComponent',
  data() {
    return {
      searchQuery: '',
      searchResults: [],
      isLoading: false
    }
  },
  computed: {
    hasResults() {
      return this.searchResults.length > 0
    },
    searchStatus() {
      if (this.isLoading) return '___搜索中___'
      if (!this.searchQuery) return '___请输入关键词___'
      return this.hasResults ? '___找到结果___' : '___无结果___'
    }
  },
  watch: {
    searchQuery(newQuery) {
      if (newQuery.length > 2) {
        this.performSearch()
      }
    }
  },
  methods: {
    onSearchInput() {
      console.log('___用户输入___:', this.searchQuery)
    },
    performSearch() {
      this.isLoading = true
      // 模拟搜索
      setTimeout(() => {
        this.searchResults = []
        this.isLoading = false
        console.log('___搜索完成___')
      }, 1000)
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n", 
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(10);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '搜索页面', '请输入搜索关键词', '正在搜索...', '未找到相关结果',
          '搜索中', '请输入关键词', '找到结果', '无结果', '用户输入', '搜索完成'
        ])
      );
    });
  });

  describe("Vue Slots and Template Features", () => {
    test("should handle Vue slots with i18n content", () => {
      const code = `
<template>
  <div class="card-component">
    <div class="card-header">
      <slot name="header">
        <h3>___默认标题___</h3>
      </slot>
    </div>
    <div class="card-body">
      <slot>
        <p>___默认内容___</p>
      </slot>
    </div>
    <div class="card-footer">
      <slot name="footer" :actions="cardActions">
        <button @click="cardActions.close">___关闭___</button>
        <button @click="cardActions.save">___保存___</button>
      </slot>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CardComponent',
  data() {
    return {
      cardActions: {
        close: () => {
          console.log('___卡片已关闭___')
          this.$emit('close')
        },
        save: () => {
          console.log('___数据已保存___')
          this.$emit('save')
        }
      }
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(6);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '默认标题', '默认内容', '关闭', '保存', '卡片已关闭', '数据已保存'
        ])
      );
    });

    test("should handle Vue scoped slots and dynamic components", () => {
      const code = `
<template>
  <div class="dynamic-list">
    <h2>___动态列表___</h2>
    <component 
      :is="currentComponent" 
      v-for="item in items" 
      :key="item.id"
      :item="item"
    >
      <template #header="{ item }">
        <h4>___项目___: {{ item.name }}</h4>
      </template>
      <template #content="{ item }">
        <p>___描述___: {{ item.description }}</p>
      </template>
      <template #actions="{ item, actions }">
        <button @click="actions.edit(item)">___编辑___</button>
        <button @click="actions.delete(item)">___删除___</button>
      </template>
    </component>
    <div v-if="items.length === 0" class="empty-state">
      ___暂无数据___
    </div>
  </div>
</template>

<script>
import ItemCard from './ItemCard.vue'
import ItemList from './ItemList.vue'

export default {
  name: 'DynamicList',
  components: {
    ItemCard,
    ItemList
  },
  data() {
    return {
      currentComponent: 'ItemCard',
      items: []
    }
  },
  methods: {
    switchView(componentName) {
      this.currentComponent = componentName
      console.log('___切换视图___:', componentName)
    },
    loadItems() {
      console.log('___加载数据___')
      // 模拟数据加载
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(8);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '动态列表', '项目', '描述', '编辑', '删除', '暂无数据', '切换视图', '加载数据'
        ])
      );
    });
  });

  describe("Vue Functional Components", () => {
    test("should handle functional components with render function", () => {
      const code = `
export default {
  name: 'FunctionalButton',
  functional: true,
  props: {
    type: String,
    disabled: Boolean
  },
  render(h, { props, data, children }) {
    const buttonText = children && children.length > 0 ? children : '___默认按钮___'
    const className = \`btn btn-\${props.type || 'default'}\`
    
    return h('button', {
      ...data,
      class: className,
      attrs: {
        disabled: props.disabled,
        title: props.disabled ? '___按钮已禁用___' : '___点击执行操作___'
      },
      on: {
        click: (event) => {
          if (props.disabled) {
            event.preventDefault()
            console.log('___按钮被禁用，无法点击___')
            return
          }
          console.log('___按钮被点击___')
          if (data.on && data.on.click) {
            data.on.click(event)
          }
        }
      }
    }, buttonText)
  }
}
      `;
      
      const tempFile = createTempFile(code, "js");
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(5);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '默认按钮', '按钮已禁用', '点击执行操作', '按钮被禁用，无法点击', '按钮被点击'
        ])
      );
    });

    test("should handle Vue 3 functional components", () => {
      const code = `
import { h } from 'vue'

export default function AlertComponent(props, { slots, emit }) {
  const alertClass = \`alert alert-\${props.type || 'info'}\`
  const alertTitle = props.title || '___提示信息___'
  
  const closeHandler = () => {
    console.log('___关闭提示___')
    emit('close')
  }
  
  return h('div', { class: alertClass }, [
    h('div', { class: 'alert-header' }, [
      h('h4', alertTitle),
      h('button', {
        class: 'close-btn',
        onClick: closeHandler,
        title: '___关闭___'
      }, '×')
    ]),
    h('div', { class: 'alert-body' }, [
      slots.default ? slots.default() : '___暂无内容___'
    ]),
    props.showActions && h('div', { class: 'alert-actions' }, [
      h('button', {
        onClick: () => {
          console.log('___确认操作___')
          emit('confirm')
        }
      }, '___确认___'),
      h('button', {
        onClick: () => {
          console.log('___取消操作___')
          emit('cancel')
        }
      }, '___取消___')
    ])
  ])
}

AlertComponent.props = {
  type: String,
  title: String,
  showActions: Boolean
}
      `;
      
      const tempFile = createTempFile(code, "js");
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(8);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '提示信息', '关闭提示', '关闭', '暂无内容', '确认操作', '确认', '取消操作', '取消'
        ])
      );
    });
  });

  describe("Vue Template Directives and Features", () => {
    test("should handle v-if, v-for, and complex template expressions", () => {
      const code = `
<template>
  <div class="product-list">
    <div class="filters">
      <h3>___商品筛选___</h3>
      <select v-model="selectedCategory">
        <option value="">___全部分类___</option>
        <option 
          v-for="category in categories" 
          :key="category.id" 
          :value="category.id"
        >
          {{ category.name }}
        </option>
      </select>
    </div>
    
    <div v-if="isLoading" class="loading">
      ___正在加载商品...___
    </div>
    
    <div v-else-if="filteredProducts.length === 0" class="empty">
      ___没有找到符合条件的商品___
    </div>
    
    <div v-else class="products">
      <div 
        v-for="product in filteredProducts" 
        :key="product.id"
        class="product-card"
        :class="{ 'on-sale': product.onSale }"
      >
        <h4>{{ product.name }}</h4>
        <p class="price">
          <span v-if="product.onSale" class="original-price">
            ___原价___: ¥{{ product.originalPrice }}
          </span>
          <span class="current-price">
            ___现价___: ¥{{ product.price }}
          </span>
        </p>
        <div class="actions">
          <button 
            @click="addToCart(product)"
            :disabled="product.stock === 0"
          >
            {{ product.stock === 0 ? '___缺货___' : '___加入购物车___' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProductList',
  data() {
    return {
      isLoading: false,
      selectedCategory: '',
      categories: [],
      products: []
    }
  },
  computed: {
    filteredProducts() {
      if (!this.selectedCategory) return this.products
      return this.products.filter(p => p.categoryId === this.selectedCategory)
    }
  },
  methods: {
    addToCart(product) {
      console.log('___添加到购物车___:', product.name)
      this.$message.success('___商品已添加到购物车___')
    },
    loadProducts() {
      this.isLoading = true
      console.log('___开始加载商品列表___')
      setTimeout(() => {
        this.isLoading = false
        console.log('___商品加载完成___')
      }, 1000)
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(12);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '商品筛选', '全部分类', '正在加载商品...', '没有找到符合条件的商品',
          '原价', '现价', '缺货', '加入购物车', '添加到购物车', '商品已添加到购物车',
          '开始加载商品列表', '商品加载完成'
        ])
      );
    });

    test("should handle custom directives and modifiers", () => {
      const code = `
<template>
  <div class="form-container">
    <h2>___用户注册表单___</h2>
    <form @submit.prevent="submitForm" @reset.prevent="resetForm">
      <div class="form-group">
        <label>___用户名___:</label>
        <input 
          v-model.trim="form.username"
          v-focus
          :placeholder="___请输入用户名___"
          @keyup.enter="focusNext"
        />
      </div>
      
      <div class="form-group">
        <label>___邮箱___:</label>
        <input 
          v-model.lazy="form.email"
          type="email"
          :placeholder="___请输入邮箱地址___"
          @blur="validateEmail"
        />
      </div>
      
      <div class="form-group">
        <label>___年龄___:</label>
        <input 
          v-model.number="form.age"
          type="number"
          :placeholder="___请输入年龄___"
          @input="validateAge"
        />
      </div>
      
      <div class="form-actions">
        <button type="submit" :disabled="!isFormValid">
          ___提交注册___
        </button>
        <button type="reset">
          ___重置表单___
        </button>
      </div>
    </form>
    
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'RegistrationForm',
  directives: {
    focus: {
      inserted(el) {
        el.focus()
      }
    }
  },
  data() {
    return {
      form: {
        username: '',
        email: '',
        age: null
      },
      errorMessage: ''
    }
  },
  computed: {
    isFormValid() {
      return this.form.username && this.form.email && this.form.age
    }
  },
  methods: {
    focusNext() {
      console.log('___移动到下一个输入框___')
    },
    validateEmail() {
      if (!this.form.email.includes('@')) {
        this.errorMessage = '___邮箱格式不正确___'
      } else {
        this.errorMessage = ''
        console.log('___邮箱验证通过___')
      }
    },
    validateAge() {
      if (this.form.age < 18) {
        this.errorMessage = '___年龄必须大于18岁___'
      } else {
        this.errorMessage = ''
        console.log('___年龄验证通过___')
      }
    },
    submitForm() {
      console.log('___提交表单数据___:', this.form)
      alert('___注册成功___')
    },
    resetForm() {
      this.form = { username: '', email: '', age: null }
      this.errorMessage = ''
      console.log('___表单已重置___')
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(17);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '用户注册表单', '用户名', '请输入用户名', '邮箱', '请输入邮箱地址',
          '年龄', '请输入年龄', '提交注册', '重置表单', '移动到下一个输入框',
          '邮箱格式不正确', '邮箱验证通过', '年龄必须大于18岁', '年龄验证通过',
          '提交表单数据', '注册成功', '表单已重置'
        ])
      );
    });
  });

  describe("Vue Mixins and Composition", () => {
    test("should handle Vue mixins with i18n content", () => {
      const code = `
// notification-mixin.js
export const notificationMixin = {
  data() {
    return {
      notifications: []
    }
  },
  methods: {
    showSuccess(message) {
      this.addNotification('success', message || '___操作成功___')
    },
    showError(message) {
      this.addNotification('error', message || '___操作失败___')
    },
    showWarning(message) {
      this.addNotification('warning', message || '___请注意___')
    },
    showInfo(message) {
      this.addNotification('info', message || '___提示信息___')
    },
    addNotification(type, message) {
      const notification = {
        id: Date.now(),
        type,
        message,
        timestamp: new Date().toLocaleString()
      }
      this.notifications.push(notification)
      console.log('___添加通知___:', notification)
      
      // 自动移除通知
      setTimeout(() => {
        this.removeNotification(notification.id)
      }, 5000)
    },
    removeNotification(id) {
      const index = this.notifications.findIndex(n => n.id === id)
      if (index > -1) {
        this.notifications.splice(index, 1)
        console.log('___移除通知___:', id)
      }
    },
    clearAllNotifications() {
      this.notifications = []
      console.log('___清空所有通知___')
    }
  }
}

// 使用 mixin 的组件
export default {
  name: 'UserDashboard',
  mixins: [notificationMixin],
  data() {
    return {
      user: null,
      isLoading: false
    }
  },
  methods: {
    async loadUserData() {
      this.isLoading = true
      try {
        console.log('___开始加载用户数据___')
        // 模拟 API 调用
        await new Promise(resolve => setTimeout(resolve, 1000))
        this.user = { name: 'John Doe', email: 'john@example.com' }
        this.showSuccess('___用户数据加载成功___')
      } catch (error) {
        console.error('___加载用户数据失败___:', error)
        this.showError('___无法加载用户数据___')
      } finally {
        this.isLoading = false
      }
    },
    async updateProfile() {
      try {
        console.log('___开始更新用户资料___')
        // 模拟更新
        await new Promise(resolve => setTimeout(resolve, 500))
        this.showSuccess('___资料更新成功___')
      } catch (error) {
        console.error('___更新资料失败___:', error)
        this.showError('___资料更新失败___')
      }
    }
  }
}
      `;
      
      const tempFile = createTempFile(code, "js");
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(15);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining([
          '操作成功', '操作失败', '请注意', '提示信息', '添加通知', '移除通知',
          '清空所有通知', '开始加载用户数据', '用户数据加载成功', '加载用户数据失败',
          '无法加载用户数据', '开始更新用户资料', '资料更新成功', '更新资料失败', '资料更新失败'
        ])
      );
    });
  });

  describe("Vue Framework Configuration", () => {
    test("should use custom i18n configuration for Vue", () => {
      const code = `
<template>
  <div>
    <h1>___自定义配置测试___</h1>
    <p>___这是一个测试组件___</p>
  </div>
</template>

<script>
export default {
  name: 'CustomConfigTest'
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "$t",
            importName: "useI18n",
            source: "@/composables/useI18n"
          }
        }
      });
      
      expect(result.code).toMatch(/import\s*?{\s*?useI18n\s*?}\s*?from\s*?"@\/composables\/useI18n"/);
      expect(result.code).toContain('useI18n()');
      expect(result.extractedStrings.length).toBe(2);
    });

    test("should handle Vue 2 specific configuration", () => {
      const code = `
<template>
  <div>
    <h1>___Vue 2 配置测试___</h1>
    <button @click="handleClick">___点击按钮___</button>
  </div>
</template>

<script>
export default {
  name: 'Vue2ConfigTest',
  methods: {
    handleClick() {
      console.log('___按钮被点击了___')
    }
  }
}
</script>
      `;
      
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);
      
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue2",
          i18nImport: {
            name: "$t",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.extractedStrings.length).toBe(3);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining(['Vue 2 配置测试', '点击按钮', '按钮被点击了'])
      );
    });

    test("should auto-detect Vue framework from .vue files", () => {
      const code = `
<template>
  <div>
    <h1>___自动检测框架___</h1>
    <p>___这是一个 Vue 组件___</p>
  </div>
</template>

<script>
export default {
  name: 'AutoDetectTest'
}
</script>
      `;
      
      const tempFile = createTempFile(code, "vue");
      tempFiles.push(tempFile);
      
      // 不指定框架，让它自动检测
      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });
      
      expect(result.code).toMatch(/import\s*?{\s*?useI18n\s*?}\s*?from\s*?"vue-i18n"/);
      expect(result.code).toContain('useI18n()');
      expect(result.extractedStrings.length).toBe(2);
    });
  });
});
