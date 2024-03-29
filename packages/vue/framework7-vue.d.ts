import Framework7, { Framework7Plugin } from 'framework7/types';
import { Store } from 'framework7/types';

import AccordionContent from './components/accordion-content';
import AccordionItem from './components/accordion-item';
import AccordionToggle from './components/accordion-toggle';
import Accordion from './components/accordion';
import ActionsButton from './components/actions-button';
import ActionsGroup from './components/actions-group';
import ActionsLabel from './components/actions-label';
import Actions from './components/actions';
import App from './components/app';
import Appbar from './components/appbar';
import AreaChart from './components/area-chart';
import Badge from './components/badge';
import BlockFooter from './components/block-footer';
import BlockHeader from './components/block-header';
import BlockTitle from './components/block-title';
import Block from './components/block';
import Button from './components/button';
import CardContent from './components/card-content';
import CardFooter from './components/card-footer';
import CardHeader from './components/card-header';
import Card from './components/card';
import Checkbox from './components/checkbox';
import Chip from './components/chip';
import Col from './components/col';
import FabBackdrop from './components/fab-backdrop';
import FabButton from './components/fab-button';
import FabButtons from './components/fab-buttons';
import Fab from './components/fab';
import Gauge from './components/gauge';
import Icon from './components/icon';
import Input from './components/input';
import Link from './components/link';
import ListButton from './components/list-button';
import ListGroup from './components/list-group';
import ListIndex from './components/list-index';
import ListInput from './components/list-input';
import ListItemCell from './components/list-item-cell';
import ListItemRow from './components/list-item-row';
import ListItem from './components/list-item';
import List from './components/list';
import LoginScreenTitle from './components/login-screen-title';
import LoginScreen from './components/login-screen';
import MenuDropdownItem from './components/menu-dropdown-item';
import MenuDropdown from './components/menu-dropdown';
import MenuItem from './components/menu-item';
import Menu from './components/menu';
import Message from './components/message';
import MessagebarAttachment from './components/messagebar-attachment';
import MessagebarAttachments from './components/messagebar-attachments';
import MessagebarSheetImage from './components/messagebar-sheet-image';
import MessagebarSheetItem from './components/messagebar-sheet-item';
import MessagebarSheet from './components/messagebar-sheet';
import Messagebar from './components/messagebar';
import MessagesTitle from './components/messages-title';
import Messages from './components/messages';
import NavLeft from './components/nav-left';
import NavRight from './components/nav-right';
import NavTitleLarge from './components/nav-title-large';
import NavTitle from './components/nav-title';
import Navbar from './components/navbar';
import PageContent from './components/page-content';
import Page from './components/page';
import Panel from './components/panel';
import PhotoBrowser from './components/photo-browser';
import PieChart from './components/pie-chart';
import Popover from './components/popover';
import Popup from './components/popup';
import Preloader from './components/preloader';
import Progressbar from './components/progressbar';
import Radio from './components/radio';
import Range from './components/range';
import RoutableModals from './components/routable-modals';
import Row from './components/row';
import Searchbar from './components/searchbar';
import Segmented from './components/segmented';
import Sheet from './components/sheet';
import SkeletonAvatar from './components/skeleton-avatar';
import SkeletonBlock from './components/skeleton-block';
import SkeletonImage from './components/skeleton-image';
import SkeletonText from './components/skeleton-text';
import Stepper from './components/stepper';
import Subnavbar from './components/subnavbar';
import SwipeoutActions from './components/swipeout-actions';
import SwipeoutButton from './components/swipeout-button';
import SwiperSlide from './components/swiper-slide';
import Swiper from './components/swiper';
import Tab from './components/tab';
import Tabs from './components/tabs';
import TextEditor from './components/text-editor';
import Toggle from './components/toggle';
import Toolbar from './components/toolbar';
import TreeviewItem from './components/treeview-item';
import Treeview from './components/treeview';
import UseIcon from './components/use-icon';
import View from './components/view';
import Views from './components/views';

export interface Framework7Theme {
  ios: boolean;
  md: boolean;
  aurora: boolean;
}

/** Object with boolean properties with information about currently used theme (iOS, MD or Aurora) */
declare const theme: Framework7Theme;

/** Main Framework7's initialized instance. It allows you to use any of Framework7 APIs */
declare const f7: Framework7;

/** Callback function that will be executed when Framework7 fully intialized. Useful to use in components when you need to access Framework7 API and to be sure it is ready. So it is safe to put all Framework7 related logic into this callback. As an argument it receives initialized Framework7 instance */
declare const f7ready: (callback: (f7: Framework7) => void) => void;

declare const Framework7Vue: Framework7Plugin;

declare const registerComponents: (app: any) => void;

interface useStore {
  (store: Store, getter: string): any;
  (getter: string): any;
}

declare const useStore: useStore;

export { AccordionContent, AccordionItem, AccordionToggle, Accordion, ActionsButton, ActionsGroup, ActionsLabel, Actions, App, Appbar, AreaChart, Badge, BlockFooter, BlockHeader, BlockTitle, Block, Button, CardContent, CardFooter, CardHeader, Card, Checkbox, Chip, Col, FabBackdrop, FabButton, FabButtons, Fab, Gauge, Icon, Input, Link, ListButton, ListGroup, ListIndex, ListInput, ListItemCell, ListItemRow, ListItem, List, LoginScreenTitle, LoginScreen, MenuDropdownItem, MenuDropdown, MenuItem, Menu, Message, MessagebarAttachment, MessagebarAttachments, MessagebarSheetImage, MessagebarSheetItem, MessagebarSheet, Messagebar, MessagesTitle, Messages, NavLeft, NavRight, NavTitleLarge, NavTitle, Navbar, PageContent, Page, Panel, PhotoBrowser, PieChart, Popover, Popup, Preloader, Progressbar, Radio, Range, RoutableModals, Row, Searchbar, Segmented, Sheet, SkeletonAvatar, SkeletonBlock, SkeletonImage, SkeletonText, Stepper, Subnavbar, SwipeoutActions, SwipeoutButton, SwiperSlide, Swiper, Tab, Tabs, TextEditor, Toggle, Toolbar, TreeviewItem, Treeview, UseIcon, View, Views }
export { f7, f7ready, theme, registerComponents, useStore };
export default Framework7Vue;
