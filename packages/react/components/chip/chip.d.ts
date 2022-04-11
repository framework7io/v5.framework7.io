
import * as React from 'react';


interface ChipProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  media ?: string;
  text ?: string | number;
  deleteable ?: boolean;
  mediaBgColor ?: string;
  mediaTextColor ?: string;
  outline ?: boolean;
  tooltip ?: string;
  tooltipTrigger ?: string;
  onClick ?: (event?: any) => void;
  onDelete ?: (event?: any) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  icon?: string;
  iconMaterial?: string;
  iconF7?: string;
  iconIos?: string;
  iconMd?: string;
  iconAurora?: string;
  iconColor?: string;
  iconSize?: string | number;
}
declare const Chip: React.FunctionComponent<ChipProps>;

export default Chip;
  