
import * as React from 'react';

import { Searchbar } from 'framework7/types';


interface SearchbarProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  noShadow ?: boolean;
  noHairline ?: boolean;
  form ?: boolean;
  placeholder ?: string;
  disableButton ?: boolean;
  disableButtonText ?: string;
  clearButton ?: boolean;
  value ?: string | number | Array<any>;
  inputEvents ?: string;
  expandable ?: boolean;
  inline ?: boolean;
  searchContainer ?: string | object;
  searchIn ?: string;
  searchItem ?: string;
  searchGroup ?: string;
  searchGroupTitle ?: string;
  foundEl ?: string | object;
  notFoundEl ?: string | object;
  backdrop ?: boolean;
  backdropEl ?: string | object;
  hideOnEnableEl ?: string | object;
  hideOnSearchEl ?: string | object;
  ignore ?: string;
  customSearch ?: boolean;
  removeDiacritics ?: boolean;
  hideDividers ?: boolean;
  hideGroups ?: boolean;
  init ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onSearchbarSearch ?: (searchbar?: Searchbar.Searchbar, query?: any, previousQuery?: any) => void;
  onSearchbarClear ?: (searchbar?: Searchbar.Searchbar, previousQuery?: any) => void;
  onSearchbarEnable ?: (searchbar?: Searchbar.Searchbar) => void;
  onSearchbarDisable ?: (searchbar?: Searchbar.Searchbar) => void;
  onChange ?: (event?: any) => void;
  onInput ?: (event?: any) => void;
  onFocus ?: (event?: any) => void;
  onBlur ?: (event?: any) => void;
  onSubmit ?: (event?: any) => void;
  onClickClear ?: (event?: any) => void;
  onClickDisable ?: (event?: any) => void;
}
declare const Searchbar: React.FunctionComponent<SearchbarProps>;

export default Searchbar;
  