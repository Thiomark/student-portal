import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NewsComponent } from './components/portal/news/news.component';
import { PortalComponent } from './views/portal/portal.component';
import { MyModulesComponent } from './components/portal/my-modules/my-modules.component';
import { LinkItemComponent, StudentInfoComponent, LinkHeadingComponent, LinkContainerComponent } from './components/portal/student-info/student-info.component';
import { TimeTableComponent } from './views/time-table/time-table.component';
import { LoginComponent } from './views/auth/auth.component';

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
    LoginComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
