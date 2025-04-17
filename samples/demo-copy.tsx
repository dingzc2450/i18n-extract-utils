'use client';

import React, { useState } from 'react';

import { useDebouncedCallback } from "use-debounce";

import { Input } from 'components/ui/input';
const SearchForm = () => {const { t } = useTranslations();
  return <input className="w-52" placeholder={t(1)} />;
};

export default SearchForm;