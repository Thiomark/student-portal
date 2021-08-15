import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NewsComponent } from './components/portal/news/news.component';
import { PortalComponent } from './views/portal/portal.component';
import { MyModulesComponent } from './components/portal/my-modules/my-modules.component';
import { LinkItemComponent, StudentInfoComponent, LinkHeadingComponent, LinkContainerComponent } from './components/portal/student-info/student-info.component';
import { TimeTableComponent } from './views/time-table/time-table.component';
import { LoginComponent, ResetPasswordComponent } from './views/auth/auth.component';
import { HttpClientModule } from '@angular/common/http';
import { SelectComponent } from './components/portal/select/select.component';
import { InputShortComponent, MyprofileComponent } from './views/myprofile/myprofile.component';
import { MymodulesComponent } from './views/mymodules/mymodules.component';
import { ModuleComponent } from './views/module/module.component';
import { CalenderComponent } from './views/calender/calender.component';

@NgModule({
  declarations: [
    AppComponent,
    NewsComponent,
    PortalComponent,
    MyModulesComponent,
    StudentInfoComponent,
    LinkItemComponent,
    LinkHeadingComponent,
    LinkContainerComponent,
    TimeTableComponent,
    LoginComponent,
    SelectComponent,
    MyprofileComponent,
    InputShortComponent,
    ResetPasswordComponent,
    MymodulesComponent,
    ModuleComponent,
    CalenderComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
