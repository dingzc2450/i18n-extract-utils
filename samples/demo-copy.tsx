import { useTranslations } from 'next-intl';
const SearchForm = () => {
  const { t } = useTranslations();

  return <input className="w-52" placeholder="t("请输入名称")" />;
};

export default SearchForm;
